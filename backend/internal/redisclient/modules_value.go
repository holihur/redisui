package redisclient

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/redis/go-redis/v9"
)

// moduleValue loads a value for known Redis module key types. It returns
// ok=false when the type is not a module type we understand, letting callers
// fall back to a generic representation.
func (s *Session) moduleValue(ctx context.Context, cli redis.UniversalClient, key, typ string, count int64) (any, int64, bool, error) {
	lt := strings.ToLower(typ)
	switch {
	case strings.Contains(lt, "tsdb") || strings.Contains(lt, "timeseries"):
		return s.timeSeriesValue(ctx, cli, key, count)
	case strings.Contains(lt, "cuckoo") || strings.Contains(lt, "bloomcf") || strings.HasSuffix(lt, "cf"):
		return infoOnlyValue(ctx, cli, "CF.INFO", key)
	case strings.Contains(lt, "bloom"):
		return infoOnlyValue(ctx, cli, "BF.INFO", key)
	case strings.Contains(lt, "topk"):
		return s.topKValue(ctx, cli, key)
	case strings.Contains(lt, "cms") || strings.Contains(lt, "countmin"):
		return infoOnlyValue(ctx, cli, "CMS.INFO", key)
	case strings.Contains(lt, "tdigest") || strings.Contains(lt, "tdis"):
		return infoOnlyValue(ctx, cli, "TDIGEST.INFO", key)
	}
	return nil, 0, false, nil
}

func (s *Session) timeSeriesValue(ctx context.Context, cli redis.UniversalClient, key string, count int64) (any, int64, bool, error) {
	if count <= 0 {
		count = 100
	}
	infoRaw, err := cli.Do(ctx, "TS.INFO", key).Result()
	if err != nil {
		return nil, 0, false, nil // not a time series after all
	}
	samplesRaw, err := cli.Do(ctx, "TS.RANGE", key, "-", "+", "COUNT", strconv.FormatInt(count, 10)).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return nil, 0, false, err
	}
	info := toMapFromPairs(infoRaw)
	samples := parseTimeSeriesSamples(samplesRaw)
	total := int64(len(samples))
	for _, k := range []string{"totalsamples", "total_samples"} {
		if v, ok := info[k]; ok {
			if n, err := strconv.ParseInt(stringify(v), 10, 64); err == nil {
				total = n
				break
			}
		}
	}
	value := map[string]any{
		"info":    normalizeValue(info),
		"samples": samples,
	}
	return value, total, true, nil
}

func (s *Session) topKValue(ctx context.Context, cli redis.UniversalClient, key string) (any, int64, bool, error) {
	infoRaw, err := cli.Do(ctx, "TOPK.INFO", key).Result()
	if err != nil {
		return nil, 0, false, nil
	}
	items := []map[string]any{}
	if res, err := cli.Do(ctx, "TOPK.LIST", key, "WITHCOUNT").Result(); err == nil {
		items = parseTopKItems(res)
	}
	value := map[string]any{
		"info":  normalizeValue(toMapFromPairs(infoRaw)),
		"items": items,
	}
	return value, int64(len(items)), true, nil
}

func infoOnlyValue(ctx context.Context, cli redis.UniversalClient, infoCmd, key string) (any, int64, bool, error) {
	raw, err := cli.Do(ctx, infoCmd, key).Result()
	if err != nil {
		return nil, 0, false, nil
	}
	return map[string]any{"info": normalizeValue(toMapFromPairs(raw))}, 0, true, nil
}

// parseTimeSeriesSamples converts TS.RANGE replies into {ts,value} objects.
func parseTimeSeriesSamples(raw any) []map[string]any {
	out := []map[string]any{}
	for _, item := range toAnySlice(raw) {
		parts := toAnySlice(item)
		if len(parts) < 2 {
			continue
		}
		ts, _ := strconv.ParseInt(stringify(parts[0]), 10, 64)
		val, _ := strconv.ParseFloat(stringify(parts[1]), 64)
		out = append(out, map[string]any{"ts": ts, "value": val})
	}
	return out
}

// parseTopKItems converts TOPK.LIST ... WITHCOUNT replies into {item,count}.
func parseTopKItems(raw any) []map[string]any {
	out := []map[string]any{}
	arr := toAnySlice(raw)
	for i := 0; i+1 < len(arr); i += 2 {
		count, _ := strconv.ParseInt(stringify(arr[i+1]), 10, 64)
		out = append(out, map[string]any{"item": stringify(arr[i]), "count": count})
	}
	return out
}

// normalizeValue converts RESP byte slices to strings so the result marshals to
// clean JSON.
func normalizeValue(v any) any {
	switch t := v.(type) {
	case []byte:
		return string(t)
	case []any:
		out := make([]any, len(t))
		for i, x := range t {
			out[i] = normalizeValue(x)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, x := range t {
			out[k] = normalizeValue(x)
		}
		return out
	default:
		return v
	}
}
