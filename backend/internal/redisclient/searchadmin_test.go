package redisclient

import (
	"reflect"
	"testing"
)

func TestParseIndexInfo(t *testing.T) {
	res := []any{
		"index_name", "idx",
		"index_options", []any{},
		"fields", []any{
			[]any{"name", "type", "TEXT", "WEIGHT", int64(1), "SORTABLE"},
			[]any{"age", "type", "NUMERIC"},
			[]any{"tag", "type", "TAG", "SEPARATOR", ","},
		},
		"num_docs", int64(2),
		"index_definition", []any{"key_type", "HASH", "prefixes", []any{"doc:"}},
	}
	info := parseIndexInfo(res)
	if info.Name != "idx" || info.NumDocs != 2 {
		t.Fatalf("header parsed wrong: %+v", info)
	}
	if info.KeyType != "HASH" {
		t.Fatalf("key type = %q", info.KeyType)
	}
	if !reflect.DeepEqual(info.Prefixes, []string{"doc:"}) {
		t.Fatalf("prefixes = %#v", info.Prefixes)
	}
	if len(info.Fields) != 3 {
		t.Fatalf("fields = %#v", info.Fields)
	}
	f0 := info.Fields[0]
	if f0.Name != "name" || f0.Type != "TEXT" {
		t.Fatalf("field0 = %+v", f0)
	}
	if !contains(f0.Attrs, "sortable") || !contains(f0.Attrs, "weight=1") {
		t.Fatalf("field0 attrs = %#v", f0.Attrs)
	}
	if info.Fields[2].Type != "TAG" || !contains(info.Fields[2].Attrs, "separator=,") {
		t.Fatalf("field2 = %+v", info.Fields[2])
	}
}

func TestParseIndexFieldModernShape(t *testing.T) {
	fi, ok := parseIndexField([]any{"identifier", "name", "attribute", "name", "type", "TEXT", "SORTABLE"})
	if !ok {
		t.Fatal("expected field")
	}
	if fi.Name != "name" || fi.Type != "TEXT" || !contains(fi.Attrs, "sortable") {
		t.Fatalf("modern field parsed wrong: %+v", fi)
	}
}

func TestSchemaArgs(t *testing.T) {
	args, err := schemaArgs([]SchemaField{
		{Name: "title", Type: "text", Options: []string{"SORTABLE"}},
		{Name: "", Type: "TEXT"}, // skipped
		{Name: "price", Type: "NUMERIC"},
	})
	if err != nil {
		t.Fatalf("schemaArgs: %v", err)
	}
	want := []any{"title", "TEXT", "SORTABLE", "price", "NUMERIC"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args = %#v, want %#v", args, want)
	}
}

func contains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}
