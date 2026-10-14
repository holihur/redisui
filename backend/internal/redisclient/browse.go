package redisclient

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"redisui/internal/model"
)

var ErrKeyNotFound = errors.New("key not found")

// KeyInfo is a lightweight row describing a key in the browser.
type KeyInfo struct {
	Key  string `json:"key"`
	Type string `json:"type"`
	TTL  int64  `json:"ttl"`  // seconds; -1 no expire, -2 missing
	Size int64  `json:"size"` // bytes; -1 unknown
}

// FieldValue is a hash/stream field pair.
type FieldValue struct {
	Field string `json:"field"`
	Value string `json:"value"`
}

// ZMember is a sorted-set member with its score.
type ZMember struct {
	Member string  `json:"member"`
	Score  float64 `json:"score"`
}

// StreamEntry is a stream element.
type StreamEntry struct {
	ID     string       `json:"id"`
	Fields []FieldValue `json:"fields"`
}

// KeyDetail is the full (paginated) value of a key.
type KeyDetail struct {
	Key    string `json:"key"`
	Type   string `json:"type"`
	TTL    int64  `json:"ttl"`
	Size   int64  `json:"size"`
	Length int64  `json:"length"`
	Cursor uint64 `json:"cursor"`
	Offset int64  `json:"offset"`
	Value  any    `json:"value"`
}

// ScanKeys performs a cursor-based SCAN (optionally filtered by type).
func (s *Session) ScanKeys(ctx context.Context, db int, cursor uint64, match string, count int64, typeFilter string, withSize bool) ([]KeyInfo, uint64, error) {
	if s.info.EffectiveMode() == model.ModeCluster {
		return s.scanCluster(ctx, match, count, withSize)
	}
	cli := s.client(db)
	if match == "" {
		match = "*"
	}
	if count <= 0 {
		count = 100
	}

	var (
		keys []string
		next uint64
		err  error
	)
	if typeFilter != "" && typeFilter != "all" {
		res, derr := cli.Do(ctx, "SCAN", strconv.FormatUint(cursor, 10), "MATCH", match, "COUNT", count, "TYPE", typeFilter).Result()
		if derr != nil {
			return nil, 0, derr
		}
		keys, next, err = parseScanReply(res)
		if err != nil {
			return nil, 0, err
		}
	} else {
		keys, next, err = cli.Scan(ctx, cursor, match, count).Result()
		if err != nil {
			return nil, 0, err
		}
	}

	infos := s.enrichKeys(ctx, cli, keys, withSize)
	return infos, next, nil
}

// enrichKeys pipelines TTL/TYPE (and optional MEMORY USAGE) for a key list.
func (s *Session) enrichKeys(ctx context.Context, cli redis.UniversalClient, keys []string, withSize bool) []KeyInfo {
	infos := make([]KeyInfo, len(keys))
	if len(keys) == 0 {
		return infos
	}
	pipe := cli.Pipeline()
	ttlCmds := make([]*redis.DurationCmd, len(keys))
	typeCmds := make([]*redis.StatusCmd, len(keys))
	var sizeCmds []*redis.IntCmd
	if withSize {
		sizeCmds = make([]*redis.IntCmd, len(keys))
	}
	for i, k := range keys {
		ttlCmds[i] = pipe.TTL(ctx, k)
		typeCmds[i] = pipe.Type(ctx, k)
		if withSize {
			sizeCmds[i] = pipe.MemoryUsage(ctx, k, 0)
		}
	}
	// Errors are inspected per-command below; ignore pipeline-level error.
	_, _ = pipe.Exec(ctx)

	for i, k := range keys {
		info := KeyInfo{Key: k, Type: typeCmds[i].Val(), Size: -1}
		if d, err := ttlCmds[i].Result(); err == nil {
			info.TTL = ttlSeconds(d)
		}
		if withSize {
			if sz, err := sizeCmds[i].Result(); err == nil {
				info.Size = sz
			}
		}
		infos[i] = info
	}
	return infos
}

// scanCluster aggregates a bounded key sample across all cluster masters.
// Cluster-wide cursor pagination is not supported; the returned cursor is
// always 0 so callers treat the page as complete.
func (s *Session) scanCluster(ctx context.Context, match string, count int64, withSize bool) ([]KeyInfo, uint64, error) {
	if match == "" {
		match = "*"
	}
	if count <= 0 {
		count = 100
	}
	cc, ok := s.client(0).(*redis.ClusterClient)
	if !ok {
		return []KeyInfo{}, 0, nil
	}
	seen := map[string]struct{}{}
	keys := []string{}
	_ = cc.ForEachMaster(ctx, func(ctx context.Context, node *redis.Client) error {
		if int64(len(keys)) >= count {
			return nil
		}
		var cursor uint64
		for {
			batch, next, err := node.Scan(ctx, cursor, match, count).Result()
			if err != nil {
				return nil // skip an unreachable node
			}
			for _, k := range batch {
				if _, dup := seen[k]; !dup {
					seen[k] = struct{}{}
					keys = append(keys, k)
				}
			}
			cursor = next
			if cursor == 0 || int64(len(keys)) >= count {
				break
			}
		}
		return nil
	})
	return s.enrichKeys(ctx, s.client(0), keys, withSize), 0, nil
}

// GetKey loads a page of a key's value.
func (s *Session) GetKey(ctx context.Context, db int, key string, cursor uint64, count int64, match string) (*KeyDetail, error) {
	cli := s.client(db)
	if count <= 0 {
		count = 100
	}
	if match == "" {
		match = "*"
	}

	typ, err := cli.Type(ctx, key).Result()
	if err != nil {
		return nil, err
	}
	if typ == "none" {
		return nil, ErrKeyNotFound
	}

	detail := &KeyDetail{Key: key, Type: typ, Size: -1}
	if d, err := cli.TTL(ctx, key).Result(); err == nil {
		detail.TTL = ttlSeconds(d)
	}
	if sz, err := cli.MemoryUsage(ctx, key, 0).Result(); err == nil {
		detail.Size = sz
	}

	switch typ {
	case "string":
		val, err := cli.Get(ctx, key).Result()
		if err != nil && !errors.Is(err, redis.Nil) {
			return nil, err
		}
		detail.Value = val
		detail.Length = int64(len(val))

	case "hash":
		total, _ := cli.HLen(ctx, key).Result()
		flat, next, err := cli.HScan(ctx, key, cursor, match, count).Result()
		if err != nil {
			return nil, err
		}
		detail.Value = flatPairs(flat)
		detail.Cursor, detail.Length = next, total

	case "list":
		total, _ := cli.LLen(ctx, key).Result()
		start := int64(cursor)
		stop := start + count - 1
		vals, err := cli.LRange(ctx, key, start, stop).Result()
		if err != nil {
			return nil, err
		}
		detail.Value = vals
		detail.Length = total
		detail.Offset = start
		loaded := start + int64(len(vals))
		if loaded < total && len(vals) > 0 {
			detail.Cursor = uint64(loaded)
		} else {
			detail.Cursor = 0
		}

	case "set":
		total, _ := cli.SCard(ctx, key).Result()
		vals, next, err := cli.SScan(ctx, key, cursor, match, count).Result()
		if err != nil {
			return nil, err
		}
		detail.Value = vals
		detail.Cursor, detail.Length = next, total

	case "zset":
		total, _ := cli.ZCard(ctx, key).Result()
		flat, next, err := cli.ZScan(ctx, key, cursor, match, count).Result()
		if err != nil {
			return nil, err
		}
		detail.Value = flatToZMembers(flat)
		detail.Cursor, detail.Length = next, total

	case "stream":
		total, _ := cli.XLen(ctx, key).Result()
		msgs, err := cli.XRangeN(ctx, key, "-", "+", count).Result()
		if err != nil {
			return nil, err
		}
		entries := make([]StreamEntry, 0, len(msgs))
		for _, m := range msgs {
			e := StreamEntry{ID: m.ID, Fields: make([]FieldValue, 0, len(m.Values))}
			for k, v := range m.Values {
				e.Fields = append(e.Fields, FieldValue{Field: k, Value: fmt.Sprintf("%v", v)})
			}
			entries = append(entries, e)
		}
		detail.Value = entries
		detail.Length = total

	case "ReJSON-RL", "json":
		// RedisJSON: return the whole document as a JSON string.
		raw, err := cli.Do(ctx, "JSON.GET", key).Result()
		if err != nil && !errors.Is(err, redis.Nil) {
			return nil, err
		}
		detail.Value = stringify(raw)
		detail.Length = 1

	case "TSDB-TYPE", "timeseries":
		// RedisTimeSeries: recent samples plus TS.INFO metadata.
		samples, err := cli.Do(ctx, "TS.RANGE", key, "-", "+", "COUNT", strconv.FormatInt(count, 10)).Result()
		if err != nil {
			return nil, err
		}
		info, _ := cli.Do(ctx, "TS.INFO", key).Result()
		detail.Value = map[string]any{"info": info, "samples": samples}
		detail.Length = int64(len(toAnySlice(samples)))

	default:
		// Unknown module type (e.g. RedisBloom, RedisGears): expose a hint and
		// fall back to a raw string representation when one exists.
		if raw, err := cli.Do(ctx, "GET", key).Result(); err == nil {
			detail.Value = stringify(raw)
		} else {
			detail.Value = map[string]any{
				"moduleType": typ,
				"note":       "This key belongs to a Redis module. Use the command console for module-specific commands.",
			}
		}
	}

	return detail, nil
}

// KeyType returns the redis type name of a key.
func (s *Session) KeyType(ctx context.Context, db int, key string) (string, error) {
	return s.client(db).Type(ctx, key).Result()
}

// ---------------------------------------------------------------------------

func parseScanReply(res any) ([]string, uint64, error) {
	arr, ok := res.([]any)
	if !ok || len(arr) != 2 {
		return nil, 0, fmt.Errorf("unexpected SCAN reply: %T", res)
	}
	var cursor uint64
	switch v := arr[0].(type) {
	case string:
		cursor, _ = strconv.ParseUint(v, 10, 64)
	case []byte:
		cursor, _ = strconv.ParseUint(string(v), 10, 64)
	case int64:
		cursor = uint64(v)
	case uint64:
		cursor = v
	}
	var keys []string
	switch v := arr[1].(type) {
	case []any:
		for _, it := range v {
			switch k := it.(type) {
			case string:
				keys = append(keys, k)
			case []byte:
				keys = append(keys, string(k))
			}
		}
	case []string:
		keys = v
	}
	return keys, cursor, nil
}

func flatPairs(flat []string) []FieldValue {
	out := make([]FieldValue, 0, len(flat)/2)
	for i := 0; i+1 < len(flat); i += 2 {
		out = append(out, FieldValue{Field: flat[i], Value: flat[i+1]})
	}
	return out
}

func flatToZMembers(flat []string) []ZMember {
	out := make([]ZMember, 0, len(flat)/2)
	for i := 0; i+1 < len(flat); i += 2 {
		score, _ := strconv.ParseFloat(flat[i+1], 64)
		out = append(out, ZMember{Member: flat[i], Score: score})
	}
	return out
}

func ttlSeconds(d time.Duration) int64 {
	if d == -1 || d == -2 {
		return int64(d)
	}
	return int64(d / time.Second)
}
