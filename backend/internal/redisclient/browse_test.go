package redisclient

import (
	"reflect"
	"testing"
	"time"
)

func TestSplitCommand(t *testing.T) {
	cases := []struct {
		in   string
		want []string
		err  bool
	}{
		{in: "GET mykey", want: []string{"GET", "mykey"}},
		{in: "  SET   k   v  ", want: []string{"SET", "k", "v"}},
		{in: `SET k "hello world"`, want: []string{"SET", "k", "hello world"}},
		{in: `SET k 'a b'`, want: []string{"SET", "k", "a b"}},
		{in: `SET k "line\nbreak"`, want: []string{"SET", "k", "line\nbreak"}},
		{in: "", err: true},
		{in: "   ", err: true},
		{in: `SET k "unterminated`, err: true},
	}
	for _, tc := range cases {
		got, err := SplitCommand(tc.in)
		if tc.err {
			if err == nil {
				t.Fatalf("SplitCommand(%q) expected error", tc.in)
			}
			continue
		}
		if err != nil {
			t.Fatalf("SplitCommand(%q) error: %v", tc.in, err)
		}
		if !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("SplitCommand(%q) = %#v, want %#v", tc.in, got, tc.want)
		}
	}
}

func TestParseScanReply(t *testing.T) {
	keys, cursor, err := parseScanReply([]any{"42", []any{"a", []byte("b"), "c"}})
	if err != nil {
		t.Fatalf("parseScanReply: %v", err)
	}
	if cursor != 42 {
		t.Fatalf("cursor = %d, want 42", cursor)
	}
	want := []string{"a", "b", "c"}
	if !reflect.DeepEqual(keys, want) {
		t.Fatalf("keys = %#v, want %#v", keys, want)
	}

	if _, _, err := parseScanReply("nope"); err == nil {
		t.Fatal("expected error for malformed reply")
	}
}

func TestFlatHelpers(t *testing.T) {
	pairs := flatPairs([]string{"f1", "v1", "f2", "v2", "odd"})
	if len(pairs) != 2 || pairs[0].Field != "f1" || pairs[1].Value != "v2" {
		t.Fatalf("flatPairs = %#v", pairs)
	}
	members := flatToZMembers([]string{"a", "1.5", "b", "2"})
	if len(members) != 2 || members[0].Member != "a" || members[0].Score != 1.5 || members[1].Score != 2 {
		t.Fatalf("flatToZMembers = %#v", members)
	}
}

func TestTTLSeconds(t *testing.T) {
	if got := ttlSeconds(-1); got != -1 {
		t.Fatalf("no-expire = %d", got)
	}
	if got := ttlSeconds(-2); got != -2 {
		t.Fatalf("missing = %d", got)
	}
	if got := ttlSeconds(90 * time.Second); got != 90 {
		t.Fatalf("90s = %d", got)
	}
}

func TestParseInfo(t *testing.T) {
	raw := "# Server\r\nredis_version:7.2.0\r\n# Memory\r\nused_memory:1024\r\n"
	sections := parseInfo(raw)
	if sections["server"]["redis_version"] != "7.2.0" {
		t.Fatalf("server section: %#v", sections["server"])
	}
	if sections["memory"]["used_memory"] != "1024" {
		t.Fatalf("memory section: %#v", sections["memory"])
	}
}
