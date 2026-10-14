package redisclient

import (
	"context"
	"fmt"
	"strconv"
	"strings"
)

// ---------------------------------------------------------------------------
// Index management (RediSearch 2.x command set)
// ---------------------------------------------------------------------------

// SchemaField describes one field in an FT.CREATE / FT.ALTER schema.
type SchemaField struct {
	Name string `json:"name"`
	Type string `json:"type"` // TEXT, TAG, NUMERIC, GEO, VECTOR
	// Options are extra tokens appended after the type, e.g. ["SORTABLE"] or
	// ["SEPARATOR", "|"]. Advanced callers can pass raw tokens.
	Options []string `json:"options,omitempty"`
}

// IndexSpec is the input for creating an index.
type IndexSpec struct {
	Index    string        `json:"index"`
	On       string        `json:"on"` // HASH (default) or JSON
	Prefixes []string      `json:"prefixes,omitempty"`
	Fields   []SchemaField `json:"fields"`
}

// IndexFieldInfo is a parsed FT.INFO field entry.
type IndexFieldInfo struct {
	Name  string   `json:"name"`
	Type  string   `json:"type"`
	Attrs []string `json:"attrs,omitempty"`
}

// IndexInfo is a normalized FT.INFO response.
type IndexInfo struct {
	Name         string           `json:"name"`
	NumDocs      int64            `json:"numDocs"`
	IndexOptions []string         `json:"indexOptions"`
	KeyType      string           `json:"keyType,omitempty"`
	Prefixes     []string         `json:"prefixes"`
	Fields       []IndexFieldInfo `json:"fields"`
	Raw          map[string]any   `json:"raw,omitempty"`
}

// IndexInfo returns parsed FT.INFO for an index.
func (s *Session) IndexInfo(ctx context.Context, db int, index string) (*IndexInfo, error) {
	if index == "" {
		return nil, fmt.Errorf("index is required")
	}
	res, err := s.client(db).Do(ctx, "FT.INFO", index).Result()
	if err != nil {
		return nil, err
	}
	return parseIndexInfo(res), nil
}

// CreateIndex creates a search index (FT.CREATE).
func (s *Session) CreateIndex(ctx context.Context, db int, spec IndexSpec) error {
	if strings.TrimSpace(spec.Index) == "" {
		return fmt.Errorf("index name is required")
	}
	on := strings.ToUpper(strings.TrimSpace(spec.On))
	if on == "" {
		on = "HASH"
	}
	args := []any{"FT.CREATE", spec.Index, "ON", on}
	if len(spec.Prefixes) > 0 {
		args = append(args, "PREFIX", strconv.Itoa(len(spec.Prefixes)))
		for _, p := range spec.Prefixes {
			args = append(args, p)
		}
	}
	schema, err := schemaArgs(spec.Fields)
	if err != nil {
		return err
	}
	if len(schema) == 0 {
		return fmt.Errorf("at least one field is required")
	}
	args = append(args, "SCHEMA")
	args = append(args, schema...)
	return s.client(db).Do(ctx, args...).Err()
}

// AlterIndex adds fields to an existing index (FT.ALTER ... SCHEMA ADD).
func (s *Session) AlterIndex(ctx context.Context, db int, index string, fields []SchemaField) error {
	if strings.TrimSpace(index) == "" {
		return fmt.Errorf("index is required")
	}
	schema, err := schemaArgs(fields)
	if err != nil {
		return err
	}
	if len(schema) == 0 {
		return fmt.Errorf("at least one field is required")
	}
	args := []any{"FT.ALTER", index, "SCHEMA", "ADD"}
	args = append(args, schema...)
	return s.client(db).Do(ctx, args...).Err()
}

// DropIndex drops an index, optionally deleting the indexed documents
// (FT.DROPINDEX ... DD).
func (s *Session) DropIndex(ctx context.Context, db int, index string, deleteDocs bool) error {
	if strings.TrimSpace(index) == "" {
		return fmt.Errorf("index is required")
	}
	args := []any{"FT.DROPINDEX", index}
	if deleteDocs {
		args = append(args, "DD")
	}
	err := s.client(db).Do(ctx, args...).Err()
	if err != nil && strings.Contains(strings.ToLower(err.Error()), "unknown command") {
		// RediSearch 1.x used FT.DROP; DD is implied there.
		return s.client(db).Do(ctx, "FT.DROP", index).Err()
	}
	return err
}

func schemaArgs(fields []SchemaField) ([]any, error) {
	out := []any{}
	for _, f := range fields {
		name := strings.TrimSpace(f.Name)
		typ := strings.ToUpper(strings.TrimSpace(f.Type))
		if name == "" || typ == "" {
			continue
		}
		out = append(out, name, typ)
		for _, opt := range f.Options {
			if strings.TrimSpace(opt) != "" {
				out = append(out, strings.TrimSpace(opt))
			}
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

func parseIndexInfo(res any) *IndexInfo {
	m := toMapFromPairs(res)
	info := &IndexInfo{
		Name:         stringify(m["index_name"]),
		IndexOptions: toStringSlice(m["index_options"]),
		Prefixes:     []string{},
		Fields:       []IndexFieldInfo{},
	}
	info.NumDocs, _ = strconv.ParseInt(stringify(m["num_docs"]), 10, 64)

	if def, ok := m["index_definition"]; ok {
		dm := toMapFromPairs(def)
		info.KeyType = stringify(dm["key_type"])
		info.Prefixes = toStringSlice(dm["prefixes"])
	} else if p, ok := m["prefixes"]; ok {
		info.Prefixes = toStringSlice(p)
	}

	for _, item := range toAnySlice(m["fields"]) {
		if f, ok := parseIndexField(item); ok {
			info.Fields = append(info.Fields, f)
		}
	}
	// Older versions expose fields under "attributes".
	if len(info.Fields) == 0 {
		for _, item := range toAnySlice(m["attributes"]) {
			if f, ok := parseIndexField(item); ok {
				info.Fields = append(info.Fields, f)
			}
		}
	}
	return info
}

// parseIndexField handles both [name, "type", TEXT, ...] and the 2.x
// [identifier, "attribute", name, "type", TEXT, ...] shapes.
func parseIndexField(item any) (IndexFieldInfo, bool) {
	tokens := toAnySlice(item)
	if len(tokens) == 0 {
		return IndexFieldInfo{}, false
	}
	fi := IndexFieldInfo{Name: stringify(tokens[0])}
	withValue := map[string]bool{"type": true, "attribute": true, "weight": true, "separator": true, "phonetic": true, "algorithm": true, "dim": true, "distance_metric": true, "initial_cap": true, "block_size": true}
	for i := 1; i < len(tokens); i++ {
		tok := strings.ToLower(stringify(tokens[i]))
		if withValue[tok] && i+1 < len(tokens) {
			val := stringify(tokens[i+1])
			i++
			switch tok {
			case "type":
				fi.Type = strings.ToUpper(val)
			case "attribute":
				fi.Name = val
			default:
				fi.Attrs = append(fi.Attrs, tok+"="+val)
			}
			continue
		}
		fi.Attrs = append(fi.Attrs, tok)
	}
	return fi, true
}

// toMapFromPairs converts a RESP flat array of alternating key/value into a map.
func toMapFromPairs(v any) map[string]any {
	out := map[string]any{}
	switch t := v.(type) {
	case map[string]any:
		for k, val := range t {
			out[strings.ToLower(k)] = val
		}
	case []any:
		for i := 0; i+1 < len(t); i += 2 {
			out[strings.ToLower(stringify(t[i]))] = t[i+1]
		}
	}
	return out
}

func toStringSlice(v any) []string {
	out := []string{}
	for _, item := range toAnySlice(v) {
		out = append(out, stringify(item))
	}
	return out
}
