package account

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// Session is an authenticated login.
type Session struct {
	Username    string
	Role        Role
	Connections []string
	ExpiresAt   time.Time
}

func (s Session) Allows(connID string) bool {
	if len(s.Connections) == 0 {
		return true
	}
	for _, c := range s.Connections {
		if c == "*" || c == connID {
			return true
		}
	}
	return false
}

// SessionManager keeps login sessions in memory with a TTL.
type SessionManager struct {
	mu       sync.Mutex
	sessions map[string]Session
	ttl      time.Duration
}

func NewSessionManager(ttl time.Duration) *SessionManager {
	if ttl <= 0 {
		ttl = 12 * time.Hour
	}
	return &SessionManager{sessions: map[string]Session{}, ttl: ttl}
}

// Create issues a new session token for a user.
func (m *SessionManager) Create(u User) (string, Session) {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	token := hex.EncodeToString(b)
	sess := Session{
		Username:    u.Username,
		Role:        u.Role,
		Connections: u.Connections,
		ExpiresAt:   time.Now().Add(m.ttl),
	}
	m.mu.Lock()
	m.sessions[token] = sess
	m.mu.Unlock()
	return token, sess
}

// Get returns a live session, evicting it if expired.
func (m *SessionManager) Get(token string) (Session, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[token]
	if !ok {
		return Session{}, false
	}
	if time.Now().After(sess.ExpiresAt) {
		delete(m.sessions, token)
		return Session{}, false
	}
	return sess, true
}

func (m *SessionManager) Delete(token string) {
	m.mu.Lock()
	delete(m.sessions, token)
	m.mu.Unlock()
}

// DeleteUser revokes every session belonging to a user.
func (m *SessionManager) DeleteUser(username string) {
	m.mu.Lock()
	for token, sess := range m.sessions {
		if sess.Username == username {
			delete(m.sessions, token)
		}
	}
	m.mu.Unlock()
}

// RefreshScope updates the cached role/scope of all of a user's sessions.
func (m *SessionManager) RefreshScope(u User) {
	m.mu.Lock()
	for token, sess := range m.sessions {
		if sess.Username == u.Username {
			sess.Role = u.Role
			sess.Connections = u.Connections
			m.sessions[token] = sess
		}
	}
	m.mu.Unlock()
}
