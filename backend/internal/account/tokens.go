package account

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

var (
	ErrTokenNotFound = errors.New("token not found")
	ErrInvalidScope  = errors.New("invalid scope (use read, write or admin)")
)

// ValidScopes are the scopes a personal access token may carry.
var ValidScopes = []string{"read", "write", "admin"}

func validScope(s string) bool {
	for _, v := range ValidScopes {
		if v == s {
			return true
		}
	}
	return false
}

// Token is a personal access token (PAT). Only its hash is stored.
type Token struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Prefix      string     `json:"prefix"`
	Hash        string     `json:"hash"`
	Scopes      []string   `json:"scopes"`
	Connections []string   `json:"connections,omitempty"`
	CreatedBy   string     `json:"createdBy,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	LastUsedAt  *time.Time `json:"lastUsedAt,omitempty"`
}

// PublicToken is the redacted representation sent to clients.
type PublicToken struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Prefix      string     `json:"prefix"`
	Scopes      []string   `json:"scopes"`
	Connections []string   `json:"connections"`
	CreatedBy   string     `json:"createdBy,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	LastUsedAt  *time.Time `json:"lastUsedAt,omitempty"`
}

func (t Token) Public() PublicToken {
	conns := t.Connections
	if conns == nil {
		conns = []string{}
	}
	scopes := t.Scopes
	if scopes == nil {
		scopes = []string{}
	}
	return PublicToken{
		ID:          t.ID,
		Name:        t.Name,
		Prefix:      t.Prefix,
		Scopes:      scopes,
		Connections: conns,
		CreatedBy:   t.CreatedBy,
		CreatedAt:   t.CreatedAt,
		ExpiresAt:   t.ExpiresAt,
		LastUsedAt:  t.LastUsedAt,
	}
}

// Role maps a token's scopes to an effective role.
func (t Token) Role() Role {
	for _, s := range t.Scopes {
		if s == "admin" {
			return RoleAdmin
		}
	}
	for _, s := range t.Scopes {
		if s == "write" {
			return RoleOperator
		}
	}
	return RoleViewer
}

// Allows reports whether the token may access the given connection id.
func (t Token) Allows(connID string) bool {
	if len(t.Connections) == 0 {
		return true
	}
	for _, c := range t.Connections {
		if c == "*" || c == connID {
			return true
		}
	}
	return false
}

func (t Token) expired() bool {
	return t.ExpiresAt != nil && time.Now().After(*t.ExpiresAt)
}

func hashToken(plain string) string {
	sum := sha256.Sum256([]byte(plain))
	return hex.EncodeToString(sum[:])
}

type tokenFile struct {
	Version int     `json:"version"`
	Tokens  []Token `json:"tokens"`
}

// TokenStore is a JSON-backed personal access token store.
type TokenStore struct {
	mu     sync.Mutex
	path   string
	tokens map[string]Token
}

func NewTokenStore(path string) (*TokenStore, error) {
	s := &TokenStore{path: path, tokens: map[string]Token{}}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return nil, err
	}
	if len(data) == 0 {
		return s, nil
	}
	var tf tokenFile
	if err := json.Unmarshal(data, &tf); err != nil {
		return nil, err
	}
	for _, t := range tf.Tokens {
		s.tokens[t.ID] = t
	}
	return s, nil
}

func (s *TokenStore) List() []PublicToken {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]PublicToken, 0, len(s.tokens))
	for _, t := range s.tokens {
		out = append(out, t.Public())
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out
}

// Create generates a new token and returns its plaintext (shown once).
func (s *TokenStore) Create(name string, scopes, conns []string, ttl time.Duration, createdBy string) (string, Token, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", Token{}, errors.New("token name is required")
	}
	if len(scopes) == 0 {
		scopes = []string{"read"}
	}
	for _, sc := range scopes {
		if !validScope(sc) {
			return "", Token{}, ErrInvalidScope
		}
	}
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", Token{}, err
	}
	plain := "redisui_pat_" + hex.EncodeToString(b)

	now := time.Now().UTC()
	t := Token{
		ID:          hex.EncodeToString(b[:8]),
		Name:        name,
		Prefix:      plain[:16],
		Hash:        hashToken(plain),
		Scopes:      normalize(scopes),
		Connections: normalize(conns),
		CreatedBy:   createdBy,
		CreatedAt:   now,
	}
	if ttl > 0 {
		exp := now.Add(ttl)
		t.ExpiresAt = &exp
	}

	s.mu.Lock()
	s.tokens[t.ID] = t
	err := s.saveLocked()
	s.mu.Unlock()
	return plain, t, err
}

func (s *TokenStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.tokens[id]; !ok {
		return ErrTokenNotFound
	}
	delete(s.tokens, id)
	return s.saveLocked()
}

// Authenticate resolves a plaintext token to its record.
func (s *TokenStore) Authenticate(plain string) (Token, bool) {
	if !strings.HasPrefix(plain, "redisui_pat_") {
		return Token{}, false
	}
	h := hashToken(plain)
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, t := range s.tokens {
		if t.Hash != h {
			continue
		}
		if t.expired() {
			delete(s.tokens, id)
			_ = s.saveLocked()
			return Token{}, false
		}
		now := time.Now().UTC()
		t.LastUsedAt = &now
		s.tokens[id] = t
		return t, true
	}
	return Token{}, false
}

func (s *TokenStore) saveLocked() error {
	tf := tokenFile{Version: 1, Tokens: make([]Token, 0, len(s.tokens))}
	for _, t := range s.tokens {
		tf.Tokens = append(tf.Tokens, t)
	}
	sort.Slice(tf.Tokens, func(i, j int) bool { return tf.Tokens[i].CreatedAt.Before(tf.Tokens[j].CreatedAt) })
	data, err := json.MarshalIndent(tf, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}
