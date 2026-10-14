// Package audit records security-relevant API activity to an append-only JSONL
// file and keeps a bounded in-memory ring for quick listing.
package audit

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	ringCap   = 2000
	maxBytes  = 5 << 20 // rotate at 5 MiB
	filePerms = 0o600
)

// Event is one audited request.
type Event struct {
	Time       time.Time `json:"time"`
	Actor      string    `json:"actor"`
	Role       string    `json:"role"`
	Method     string    `json:"method"`
	Path       string    `json:"path"`
	Status     int       `json:"status"`
	Remote     string    `json:"remote,omitempty"`
	DurationMs int64     `json:"durationMs,omitempty"`
}

// Logger writes events and keeps recent ones in memory.
type Logger struct {
	mu   sync.Mutex
	path string
	f    *os.File
	size int64
	ring []Event
}

// New opens (or creates) the audit log at path.
func New(path string) (*Logger, error) {
	l := &Logger{path: path}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	if err := l.open(); err != nil {
		return nil, err
	}
	return l, nil
}

func (l *Logger) open() error {
	f, err := os.OpenFile(l.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, filePerms)
	if err != nil {
		return err
	}
	info, _ := f.Stat()
	l.f = f
	if info != nil {
		l.size = info.Size()
	}
	return nil
}

// Record appends an event to the ring and the file. Errors are swallowed: the
// audit log must never break request handling.
func (l *Logger) Record(e Event) {
	if e.Time.IsZero() {
		e.Time = time.Now().UTC()
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	l.ring = append(l.ring, e)
	if len(l.ring) > ringCap {
		l.ring = l.ring[len(l.ring)-ringCap:]
	}

	if l.f == nil {
		return
	}
	line, err := json.Marshal(e)
	if err != nil {
		return
	}
	line = append(line, '\n')
	n, _ := l.f.Write(line)
	l.size += int64(n)
	if l.size > maxBytes {
		l.rotate()
	}
}

func (l *Logger) rotate() {
	if l.f != nil {
		_ = l.f.Close()
	}
	_ = os.Rename(l.path, l.path+".1")
	l.size = 0
	if err := l.open(); err != nil {
		l.f = nil
	}
}

// List returns up to limit recent events (newest first), optionally filtered by
// actor (substring match, case-insensitive).
func (l *Logger) List(limit int, actor string) []Event {
	if limit <= 0 || limit > ringCap {
		limit = 200
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]Event, 0, limit)
	for i := len(l.ring) - 1; i >= 0 && len(out) < limit; i-- {
		if actor != "" && !containsFold(l.ring[i].Actor, actor) {
			continue
		}
		out = append(out, l.ring[i])
	}
	return out
}

// Count returns the number of buffered events.
func (l *Logger) Count() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.ring)
}

// Close closes the underlying file.
func (l *Logger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.f != nil {
		err := l.f.Close()
		l.f = nil
		return err
	}
	return nil
}

func containsFold(s, sub string) bool {
	if sub == "" {
		return true
	}
	return strings.Contains(strings.ToLower(s), strings.ToLower(sub))
}
