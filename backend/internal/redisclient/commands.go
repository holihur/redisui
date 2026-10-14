package redisclient

import (
	"context"
	"sort"
	"strconv"
	"strings"
)

// CommandInfo is a trimmed view of a Redis command (from the COMMAND reply).
type CommandInfo struct {
	Name     string   `json:"name"`
	Arity    int64    `json:"arity"`
	FirstKey int64    `json:"firstKey"`
	LastKey  int64    `json:"lastKey"`
	Step     int64    `json:"step"`
	Flags    []string `json:"flags"`
}

// Commands returns the server's command table (including module commands).
func (s *Session) Commands(ctx context.Context, db int) ([]CommandInfo, error) {
	res, err := s.client(db).Do(ctx, "COMMAND").Result()
	if err != nil {
		return nil, err
	}
	out := []CommandInfo{}
	for _, item := range toAnySlice(res) {
		parts := toAnySlice(item)
		if len(parts) < 6 {
			continue
		}
		ci := CommandInfo{Name: strings.ToLower(stringify(parts[0]))}
		ci.Arity, _ = strconv.ParseInt(stringify(parts[1]), 10, 64)
		for _, f := range toAnySlice(parts[2]) {
			ci.Flags = append(ci.Flags, stringify(f))
		}
		ci.FirstKey, _ = strconv.ParseInt(stringify(parts[3]), 10, 64)
		ci.LastKey, _ = strconv.ParseInt(stringify(parts[4]), 10, 64)
		ci.Step, _ = strconv.ParseInt(stringify(parts[5]), 10, 64)
		if ci.Name == "" {
			continue
		}
		out = append(out, ci)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}
