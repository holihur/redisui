package redisclient

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// ---------------------------------------------------------------------------
// Module discovery
// ---------------------------------------------------------------------------

type ModuleInfo struct {
	Name string `json:"name"`
	Ver  int64  `json:"ver"`
	Path string `json:"path"`
}

// Modules returns the modules loaded on the server (MODULE LIST).
func (s *Session) Modules(ctx context.Context, db int) ([]ModuleInfo, error) {
	res, err := s.client(db).Do(ctx, "MODULE", "LIST").Result()
	if err != nil {
		return nil, err
	}
	out := []ModuleInfo{}
	for _, item := range toAnySlice(res) {
		fields := moduleFields(item)
		if len(fields) == 0 {
			continue
		}
		info := ModuleInfo{Name: fields["name"], Path: fields["path"]}
		info.Ver, _ = strconv.ParseInt(fields["ver"], 10, 64)
		out = append(out, info)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func moduleFields(item any) map[string]string {
	out := map[string]string{}
	switch v := item.(type) {
	case map[string]any:
		for k, val := range v {
			out[strings.ToLower(k)] = stringify(val)
		}
	case []any:
		for i := 0; i+1 < len(v); i += 2 {
			out[strings.ToLower(stringify(v[i]))] = stringify(v[i+1])
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// RediSearch
// ---------------------------------------------------------------------------

// Indexes lists RediSearch indexes (FT._LIST).
func (s *Session) Indexes(ctx context.Context, db int) ([]string, error) {
	res, err := s.client(db).Do(ctx, "FT._LIST").Result()
	if err != nil {
		return nil, err
	}
	out := []string{}
	for _, v := range toAnySlice(res) {
		out = append(out, fmt.Sprintf("%v", v))
	}
	sort.Strings(out)
	return out, nil
}

// SearchHit is one document returned by FT.SEARCH.
type SearchHit map[string]string

type SearchResult struct {
	Total int64       `json:"total"`
	Hits  []SearchHit `json:"hits"`
}

// Search runs a RediSearch query against an index.
func (s *Session) Search(ctx context.Context, db int, index, query string, offset, limit int64) (*SearchResult, error) {
	if index == "" {
		return nil, fmt.Errorf("index is required")
	}
	if query == "" {
		query = "*"
	}
	if limit <= 0 {
		limit = 25
	}
	res, err := s.client(db).Do(ctx, "FT.SEARCH", index, query, "LIMIT", offset, limit).Result()
	if err != nil {
		return nil, err
	}
	return parseSearchResult(res), nil
}

func parseSearchResult(res any) *SearchResult {
	out := &SearchResult{Hits: []SearchHit{}}
	arr := toAnySlice(res)
	if len(arr) == 0 {
		return out
	}
	out.Total, _ = strconv.ParseInt(fmt.Sprintf("%v", arr[0]), 10, 64)

	// Remaining items alternate: docID, field array (or reseponse map for JSON).
	for i := 1; i < len(arr); i += 2 {
		hit := SearchHit{"__key": fmt.Sprintf("%v", arr[i])}
		if i+1 < len(arr) {
			for k, v := range attributesToMap(arr[i+1]) {
				hit[k] = v
			}
		}
		out.Hits = append(out.Hits, hit)
	}
	return out
}

func attributesToMap(item any) map[string]string {
	out := map[string]string{}
	switch v := item.(type) {
	case map[string]any:
		for k, val := range v {
			out[k] = stringify(val)
		}
	case []any:
		for i := 0; i+1 < len(v); i += 2 {
			out[fmt.Sprintf("%v", v[i])] = stringify(v[i+1])
		}
	}
	return out
}

func stringify(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case []byte:
		return string(t)
	default:
		return fmt.Sprintf("%v", t)
	}
}

// toAnySlice normalizes the many shapes go-redis may return for a RESP array.
func toAnySlice(v any) []any {
	switch t := v.(type) {
	case []any:
		return t
	case []string:
		out := make([]any, len(t))
		for i, s := range t {
			out[i] = s
		}
		return out
	default:
		return nil
	}
}
