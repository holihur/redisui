package audit

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRecordAndList(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.jsonl")
	l, err := New(path)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer l.Close()

	for i := 0; i < 5; i++ {
		l.Record(Event{Actor: "alice", Role: "admin", Method: "POST", Path: "/api/x", Status: 200, Time: time.Now()})
	}
	l.Record(Event{Actor: "bob", Method: "DELETE", Path: "/api/y", Status: 204})

	all := l.List(10, "")
	if len(all) != 6 {
		t.Fatalf("expected 6 events, got %d", len(all))
	}
	if all[0].Actor != "bob" {
		t.Fatalf("newest first expected bob, got %s", all[0].Actor)
	}
	filtered := l.List(10, "ali")
	if len(filtered) != 5 {
		t.Fatalf("filter got %d", len(filtered))
	}
	if l.Count() != 6 {
		t.Fatalf("count = %d", l.Count())
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("audit file should not be empty")
	}
}

func TestRingCap(t *testing.T) {
	l, _ := New(filepath.Join(t.TempDir(), "audit.jsonl"))
	defer l.Close()
	for i := 0; i < ringCap+50; i++ {
		l.Record(Event{Actor: "x"})
	}
	if l.Count() != ringCap {
		t.Fatalf("ring should cap at %d, got %d", ringCap, l.Count())
	}
}
