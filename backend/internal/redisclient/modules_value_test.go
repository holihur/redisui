package redisclient

import (
	"reflect"
	"testing"
)

func TestParseTimeSeriesSamples(t *testing.T) {
	raw := []any{
		[]any{int64(1700000000000), "1.5"},
		[]any{[]byte("1700000001000"), []byte("2")},
		[]any{"bad"},
	}
	got := parseTimeSeriesSamples(raw)
	if len(got) != 2 {
		t.Fatalf("expected 2 samples, got %#v", got)
	}
	if got[0]["ts"] != int64(1700000000000) || got[0]["value"] != 1.5 {
		t.Fatalf("sample 0 wrong: %#v", got[0])
	}
	if got[1]["ts"] != int64(1700000001000) || got[1]["value"] != 2.0 {
		t.Fatalf("sample 1 wrong: %#v", got[1])
	}
}

func TestParseTopKItems(t *testing.T) {
	raw := []any{"alpha", int64(3), []byte("beta"), int64(1)}
	got := parseTopKItems(raw)
	if len(got) != 2 {
		t.Fatalf("expected 2 items, got %#v", got)
	}
	if got[0]["item"] != "alpha" || got[0]["count"] != int64(3) {
		t.Fatalf("item 0 wrong: %#v", got[0])
	}
	if got[1]["item"] != "beta" || got[1]["count"] != int64(1) {
		t.Fatalf("item 1 wrong: %#v", got[1])
	}
}

func TestNormalizeValue(t *testing.T) {
	in := map[string]any{
		"a":      []byte("hello"),
		"nested": []any{[]byte("x"), int64(1)},
		"m":      map[string]any{"k": []byte("v")},
		"num":    int64(7),
	}
	got, ok := normalizeValue(in).(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", normalizeValue(in))
	}
	if got["a"] != "hello" || got["num"] != int64(7) {
		t.Fatalf("scalars wrong: %#v", got)
	}
	nested, _ := got["nested"].([]any)
	if len(nested) != 2 || nested[0] != "x" || nested[1] != int64(1) {
		t.Fatalf("nested wrong: %#v", got["nested"])
	}
	m, _ := got["m"].(map[string]any)
	if m["k"] != "v" {
		t.Fatalf("map wrong: %#v", got["m"])
	}
}

func TestModuleValueDispatchUnknown(t *testing.T) {
	s := &Session{}
	_, _, ok, err := s.moduleValue(t.Context(), nil, "k", "some-unknown-type", 10)
	if err != nil || ok {
		t.Fatalf("unknown module type should be ok=false, got ok=%v err=%v", ok, err)
	}
	if !reflect.DeepEqual(parseTopKItems(nil), []map[string]any{}) {
		t.Fatal("nil parse should return empty slice")
	}
}
