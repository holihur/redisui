package redisclient

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Mutation describes a write operation coming from the UI.
type Mutation struct {
	DB      int      `json:"db"`
	Key     string   `json:"key"`
	Type    string   `json:"type"`
	Action  string   `json:"action"`
	Field   string   `json:"field"`
	Value   string   `json:"value"`
	Values  []string `json:"values"`
	Score   float64  `json:"score"`
	Index   int64    `json:"index"`
	NewKey  string   `json:"newKey"`
	TTL     int64    `json:"ttl"`
	HasTTL  bool     `json:"hasTtl"`
	KeepTTL bool     `json:"keepTtl"`
	Side    string   `json:"side"`
	Count   int64    `json:"count"`
}

// Apply executes a mutation against the session.
func (s *Session) Apply(ctx context.Context, m Mutation) (any, error) {
	cli := s.client(m.DB)
	if m.Key == "" && m.Action != "flushdb" && m.Action != "flushall" {
		return nil, fmt.Errorf("key is required")
	}

	switch m.Action {
	case "string.set":
		exp := time.Duration(redis.KeepTTL)
		if m.HasTTL {
			if m.TTL > 0 {
				exp = time.Duration(m.TTL) * time.Second
			} else {
				exp = 0
			}
		}
		return nil, cli.Set(ctx, m.Key, m.Value, exp).Err()

	case "json.set":
		val := strings.TrimSpace(m.Value)
		if val == "" {
			return nil, fmt.Errorf("json value is required")
		}
		return nil, cli.Do(ctx, "JSON.SET", m.Key, "$", val).Err()

	case "ts.add":
		val := strings.TrimSpace(m.Value)
		if val == "" {
			return nil, fmt.Errorf("value is required")
		}
		ts := "*"
		if m.Count > 0 {
			ts = strconv.FormatInt(m.Count, 10)
		}
		return nil, cli.Do(ctx, "TS.ADD", m.Key, ts, val).Err()

	case "bf.add":
		return nil, moduleAdd(ctx, cli, "BF.ADD", m)
	case "cf.add":
		return nil, moduleAdd(ctx, cli, "CF.ADD", m)
	case "topk.add":
		return nil, moduleAdd(ctx, cli, "TOPK.ADD", m)
	case "tdigest.add":
		return nil, moduleAdd(ctx, cli, "TDIGEST.ADD", m)

	case "cms.incrby":
		val := strings.TrimSpace(m.Value)
		if val == "" {
			return nil, fmt.Errorf("value is required")
		}
		inc := m.Count
		if inc == 0 {
			inc = 1
		}
		return nil, cli.Do(ctx, "CMS.INCRBY", m.Key, val, strconv.FormatInt(inc, 10)).Err()

	case "hash.set":
		return nil, cli.HSet(ctx, m.Key, m.Field, m.Value).Err()
	case "hash.del":
		return cli.HDel(ctx, m.Key, m.Field).Result()

	case "list.push":
		vals := toAny(m.Values)
		if len(vals) == 0 {
			vals = []any{m.Value}
		}
		if strings.EqualFold(m.Side, "left") || strings.EqualFold(m.Side, "l") {
			return cli.LPush(ctx, m.Key, vals...).Result()
		}
		return cli.RPush(ctx, m.Key, vals...).Result()
	case "list.set":
		return nil, cli.LSet(ctx, m.Key, m.Index, m.Value).Err()
	case "list.rem":
		count := m.Count
		return cli.LRem(ctx, m.Key, count, m.Value).Result()

	case "set.add":
		vals := toAny(m.Values)
		if len(vals) == 0 {
			vals = []any{m.Value}
		}
		return cli.SAdd(ctx, m.Key, vals...).Result()
	case "set.rem":
		vals := toAny(m.Values)
		if len(vals) == 0 {
			vals = []any{m.Value}
		}
		return cli.SRem(ctx, m.Key, vals...).Result()

	case "zset.add":
		return cli.ZAdd(ctx, m.Key, redis.Z{Score: m.Score, Member: m.Value}).Result()
	case "zset.rem":
		return cli.ZRem(ctx, m.Key, m.Value).Result()

	case "rename":
		if m.NewKey == "" {
			return nil, fmt.Errorf("newKey is required")
		}
		if err := cli.Rename(ctx, m.Key, m.NewKey).Err(); err != nil {
			return nil, err
		}
		return m.NewKey, nil

	case "expire":
		if m.TTL <= 0 {
			return cli.Persist(ctx, m.Key).Result()
		}
		return cli.Expire(ctx, m.Key, time.Duration(m.TTL)*time.Second).Result()

	case "persist":
		return cli.Persist(ctx, m.Key).Result()

	case "delete":
		return cli.Del(ctx, m.Key).Result()

	case "flushdb":
		return nil, cli.FlushDB(ctx).Err()
	case "flushall":
		return nil, cli.FlushAll(ctx).Err()

	default:
		return nil, fmt.Errorf("unknown action %q", m.Action)
	}
}

// RunCommand executes a raw Redis command (redis-cli style line).
func (s *Session) RunCommand(ctx context.Context, db int, line string) (any, error) {
	args, err := SplitCommand(line)
	if err != nil {
		return nil, err
	}
	return s.RunCommandArgs(ctx, db, args)
}

// RunCommandArgs executes a raw Redis command from an argument slice.
func (s *Session) RunCommandArgs(ctx context.Context, db int, args []string) (any, error) {
	if len(args) == 0 {
		return nil, fmt.Errorf("empty command")
	}
	res, err := s.client(db).Do(ctx, toAny(args)...).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, err
	}
	return normalize(res), nil
}

// Expire sets/clears a TTL on a key.
func (s *Session) Expire(ctx context.Context, db int, key string, ttl int64) error {
	cli := s.client(db)
	if ttl <= 0 {
		return cli.Persist(ctx, key).Err()
	}
	return cli.Expire(ctx, key, time.Duration(ttl)*time.Second).Err()
}

// Delete removes keys.
func (s *Session) Delete(ctx context.Context, db int, keys ...string) (int64, error) {
	if len(keys) == 0 {
		return 0, nil
	}
	return s.client(db).Del(ctx, keys...).Result()
}

// Rename renames a key.
func (s *Session) Rename(ctx context.Context, db int, key, newKey string) error {
	return s.client(db).Rename(ctx, key, newKey).Err()
}

// DBSize returns the number of keys in a database.
func (s *Session) DBSize(ctx context.Context, db int) (int64, error) {
	return s.client(db).DBSize(ctx).Result()
}

func toAny(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}

// normalize converts go-redis reply values into JSON-friendly Go values.
func normalize(v any) any {
	switch t := v.(type) {
	case nil:
		return nil
	case []byte:
		return string(t)
	case []any:
		out := make([]any, len(t))
		for i, it := range t {
			out[i] = normalize(it)
		}
		return out
	case map[any]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			out[fmt.Sprintf("%v", k)] = normalize(val)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			out[k] = normalize(val)
		}
		return out
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64, bool, string:
		return t
	default:
		return fmt.Sprintf("%v", t)
	}
}

var _ = strconv.Itoa

// moduleAdd issues a single-value add command for RedisBloom-family modules.
func moduleAdd(ctx context.Context, cli redis.UniversalClient, cmd string, m Mutation) error {
	val := strings.TrimSpace(m.Value)
	if val == "" {
		return fmt.Errorf("value is required")
	}
	return cli.Do(ctx, cmd, m.Key, val).Err()
}
