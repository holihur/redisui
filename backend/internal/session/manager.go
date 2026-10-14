package session

import (
	"context"
	"errors"
	"sync"
	"time"

	"redisui/internal/model"
	"redisui/internal/redisclient"
)

var ErrNotFound = errors.New("session not found")

// Manager keeps live Redis sessions in memory.
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*redisclient.Session
}

func NewManager() *Manager {
	return &Manager{sessions: map[string]*redisclient.Session{}}
}

// Open creates a new live session for the given profile.
func (m *Manager) Open(ctx context.Context, id string, info model.Connection) (*redisclient.Session, error) {
	sess, err := redisclient.Connect(ctx, id, info)
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	m.sessions[id] = sess
	m.mu.Unlock()
	return sess, nil
}

// Get returns a live session by id, optionally verifying it belongs to connID.
func (m *Manager) Get(id string) (*redisclient.Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[id]
	if !ok {
		return nil, ErrNotFound
	}
	return s, nil
}

// Close terminates and removes a session.
func (m *Manager) Close(id string) error {
	m.mu.Lock()
	s, ok := m.sessions[id]
	if ok {
		delete(m.sessions, id)
	}
	m.mu.Unlock()
	if !ok {
		return ErrNotFound
	}
	return s.Close()
}

// CloseByConn closes every session belonging to a connection profile.
func (m *Manager) CloseByConn(connID string) {
	m.mu.Lock()
	var victims []*redisclient.Session
	for id, s := range m.sessions {
		if s.ConnID == connID {
			victims = append(victims, s)
			delete(m.sessions, id)
		}
	}
	m.mu.Unlock()
	for _, s := range victims {
		_ = s.Close()
	}
}

// List returns metadata about all live sessions.
func (m *Manager) List() []map[string]any {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]map[string]any, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, s.Info())
	}
	return out
}

// CloseAll shuts down every session.
func (m *Manager) CloseAll() {
	m.mu.Lock()
	victims := make([]*redisclient.Session, 0, len(m.sessions))
	for id, s := range m.sessions {
		victims = append(victims, s)
		delete(m.sessions, id)
	}
	m.mu.Unlock()
	for _, s := range victims {
		_ = s.Close()
	}
}

var _ = time.Now
