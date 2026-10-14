package redisclient

import "testing"

func TestModuleFields(t *testing.T) {
	got := moduleFields([]any{"name", []byte("ReJSON"), "ver", int64(20600), "path", "/usr/lib/rejson.so"})
	if got["name"] != "ReJSON" {
		t.Fatalf("name = %q", got["name"])
	}
	if got["ver"] != "20600" {
		t.Fatalf("ver = %q", got["ver"])
	}
	if got["path"] != "/usr/lib/rejson.so" {
		t.Fatalf("path = %q", got["path"])
	}

	m := moduleFields(map[string]any{"Name": "search", "Ver": 20800})
	if m["name"] != "search" || m["ver"] != "20800" {
		t.Fatalf("map form parsed wrong: %#v", m)
	}
}

func TestParseSearchResult(t *testing.T) {
	res := []any{
		int64(2),
		"doc:1", []any{"name", "alice", "age", int64(30)},
		"doc:2", []any{"name", "bob"},
	}
	out := parseSearchResult(res)
	if out.Total != 2 {
		t.Fatalf("total = %d", out.Total)
	}
	if len(out.Hits) != 2 {
		t.Fatalf("hits = %d", len(out.Hits))
	}
	if out.Hits[0]["__key"] != "doc:1" || out.Hits[0]["name"] != "alice" || out.Hits[0]["age"] != "30" {
		t.Fatalf("hit0 = %#v", out.Hits[0])
	}
	if out.Hits[1]["__key"] != "doc:2" || out.Hits[1]["name"] != "bob" {
		t.Fatalf("hit1 = %#v", out.Hits[1])
	}
}

func TestParseSearchResultEmpty(t *testing.T) {
	out := parseSearchResult([]any{int64(0)})
	if out.Total != 0 || len(out.Hits) != 0 {
		t.Fatalf("expected empty result, got %#v", out)
	}
	if parseSearchResult(nil).Hits == nil {
		t.Fatal("hits must be non-nil for JSON encoding")
	}
}

func TestToAnySlice(t *testing.T) {
	if got := toAnySlice([]string{"a", "b"}); len(got) != 2 || got[0] != "a" {
		t.Fatalf("string slice conversion: %#v", got)
	}
	if got := toAnySlice("nope"); got != nil {
		t.Fatalf("unexpected conversion: %#v", got)
	}
}

func TestAttributesToMap(t *testing.T) {
	if got := attributesToMap([]any{"a", "1", "b", []byte("2")}); got["a"] != "1" || got["b"] != "2" {
		t.Fatalf("attributes = %#v", got)
	}
}
