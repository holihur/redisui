package redisclient

import (
	"context"
	"encoding/base64"
	"sort"
	"strconv"
	"strings"

	"github.com/redis/go-redis/v9"
)

// ---------------------------------------------------------------------------
// Slow log
// ---------------------------------------------------------------------------

type SlowlogEntry struct {
	ID             int64    `json:"id"`
	Timestamp      int64    `json:"timestamp"` // unix seconds
	DurationMicros int64    `json:"durationMicros"`
	Args           []string `json:"args"`
	ClientAddr     string   `json:"clientAddr"`
	ClientName     string   `json:"clientName"`
}

func (s *Session) Slowlog(ctx context.Context, db int, count int64) ([]SlowlogEntry, error) {
	if count <= 0 {
		count = 100
	}
	logs, err := s.client(db).SlowLogGet(ctx, count).Result()
	if err != nil {
		// Redis < 7.0 may not expose SLOWLOG (e.g. managed services).
		return nil, err
	}
	out := make([]SlowlogEntry, 0, len(logs))
	for _, l := range logs {
		out = append(out, SlowlogEntry{
			ID:             l.ID,
			Timestamp:      l.Time.Unix(),
			DurationMicros: l.Duration.Microseconds(),
			Args:           l.Args,
			ClientAddr:     l.ClientAddr,
			ClientName:     l.ClientName,
		})
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

type MemoryReport struct {
	Info    map[string]string `json:"info"`
	Doctor  string            `json:"doctor"`
	TopKeys []KeyInfo         `json:"topKeys"`
	Sampled int               `json:"sampled"`
}

// MemoryReport returns INFO memory, MEMORY DOCTOR and the largest keys found in
// a random sample. Sampling avoids a full keyspace scan on large databases.
func (s *Session) MemoryReport(ctx context.Context, db int, sample int64, limit int) (*MemoryReport, error) {
	cli := s.client(db)
	report := &MemoryReport{Info: map[string]string{}, TopKeys: []KeyInfo{}}

	if raw, err := cli.Info(ctx, "memory").Result(); err == nil {
		if sec, ok := parseInfo(raw)["memory"]; ok {
			report.Info = sec
		}
	}
	if doctor, err := cli.Do(ctx, "MEMORY", "DOCTOR").Text(); err == nil {
		report.Doctor = doctor
	}

	if sample <= 0 {
		sample = 1000
	}
	if limit <= 0 {
		limit = 20
	}
	keys, _, err := cli.Scan(ctx, 0, "*", sample).Result()
	if err != nil {
		return report, nil
	}
	report.Sampled = len(keys)
	if len(keys) == 0 {
		return report, nil
	}
	pipe := cli.Pipeline()
	sizes := make([]*redis.IntCmd, len(keys))
	types := make([]*redis.StatusCmd, len(keys))
	for i, k := range keys {
		sizes[i] = pipe.MemoryUsage(ctx, k, 0)
		types[i] = pipe.Type(ctx, k)
	}
	_, _ = pipe.Exec(ctx)

	infos := make([]KeyInfo, 0, len(keys))
	for i, k := range keys {
		sz, err := sizes[i].Result()
		if err != nil || sz <= 0 {
			continue
		}
		infos = append(infos, KeyInfo{Key: k, Type: types[i].Val(), Size: sz, TTL: -1})
	}
	sort.Slice(infos, func(i, j int) bool { return infos[i].Size > infos[j].Size })
	if len(infos) > limit {
		infos = infos[:limit]
	}
	report.TopKeys = infos
	return report, nil
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

// ClientInfo is a parsed CLIENT LIST row.
type ClientInfo map[string]string

func (s *Session) Clients(ctx context.Context, db int) ([]ClientInfo, error) {
	raw, err := s.client(db).ClientList(ctx).Result()
	if err != nil {
		return nil, err
	}
	return parseClientList(raw), nil
}

func parseClientList(raw string) []ClientInfo {
	out := []ClientInfo{}
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		row := ClientInfo{}
		for _, field := range strings.Fields(line) {
			k, v, ok := strings.Cut(field, "=")
			if ok {
				row[k] = v
			}
		}
		if len(row) > 0 {
			out = append(out, row)
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

// DeleteByPattern deletes every key matching match using batched SCAN + DEL.
func (s *Session) DeleteByPattern(ctx context.Context, db int, match string, batch int64) (int64, error) {
	cli := s.client(db)
	if match == "" {
		match = "*"
	}
	if batch <= 0 {
		batch = 500
	}
	var (
		cursor uint64
		total  int64
	)
	for {
		keys, next, err := cli.Scan(ctx, cursor, match, batch).Result()
		if err != nil {
			return total, err
		}
		if len(keys) > 0 {
			n, err := cli.Del(ctx, keys...).Result()
			if err != nil {
				return total, err
			}
			total += n
		}
		cursor = next
		if cursor == 0 {
			break
		}
		if ctx.Err() != nil {
			return total, ctx.Err()
		}
	}
	return total, nil
}

// ---------------------------------------------------------------------------
// Export / import (DUMP + RESTORE)
// ---------------------------------------------------------------------------

type ExportItem struct {
	Key  string `json:"key"`
	TTL  int64  `json:"ttl"`  // seconds; -1 = no expiry
	Dump string `json:"dump"` // base64-encoded DUMP payload
}

// Export dumps up to limit keys matching match.
func (s *Session) Export(ctx context.Context, db int, match string, limit int64) ([]ExportItem, error) {
	if match == "" {
		match = "*"
	}
	if limit <= 0 {
		limit = 1000
	}
	cli := s.client(db)
	var (
		cursor uint64
		out    []ExportItem
	)
	for int64(len(out)) < limit {
		keys, next, err := cli.Scan(ctx, cursor, match, 500).Result()
		if err != nil {
			return out, err
		}
		for _, k := range keys {
			if int64(len(out)) >= limit {
				break
			}
			dump, err := cli.Dump(ctx, k).Bytes()
			if err != nil {
				continue
			}
			ttl, _ := cli.TTL(ctx, k).Result()
			out = append(out, ExportItem{
				Key:  k,
				TTL:  ttlSeconds(ttl),
				Dump: base64.StdEncoding.EncodeToString(dump),
			})
		}
		cursor = next
		if cursor == 0 {
			break
		}
		if ctx.Err() != nil {
			return out, ctx.Err()
		}
	}
	return out, nil
}

// Import restores exported items. When replace is true, existing keys are
// overwritten. It returns the number imported and any per-key errors.
func (s *Session) Import(ctx context.Context, db int, items []ExportItem, replace bool) (int, []string) {
	cli := s.client(db)
	imported := 0
	var errs []string
	for _, it := range items {
		raw, err := base64.StdEncoding.DecodeString(it.Dump)
		if err != nil {
			errs = append(errs, it.Key+": invalid dump encoding")
			continue
		}
		ttlMs := int64(0)
		if it.TTL > 0 {
			ttlMs = it.TTL * 1000
		}
		args := []any{"RESTORE", it.Key, ttlMs, raw}
		if replace {
			args = append(args, "REPLACE")
		}
		if err := cli.Do(ctx, args...).Err(); err != nil {
			errs = append(errs, it.Key+": "+err.Error())
			continue
		}
		imported++
	}
	return imported, errs
}

// Subscribe opens a pub/sub subscription on the session's database client.
// The caller owns the returned PubSub and must Close it.
func (s *Session) Subscribe(ctx context.Context, db int, channels, patterns []string) (*redis.PubSub, error) {
	cli := s.client(db)
	ps := cli.Subscribe(ctx, channels...)
	if len(patterns) > 0 {
		ps.PSubscribe(ctx, patterns...)
	}
	// Wait for the subscription confirmations so callers get an error early.
	for i := 0; i < len(channels)+len(patterns); i++ {
		if _, err := ps.Receive(ctx); err != nil {
			_ = ps.Close()
			return nil, err
		}
	}
	return ps, nil
}

var _ = strconv.Itoa
