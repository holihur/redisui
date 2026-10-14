// Package account stores local users (bcrypt-hashed passwords) and their
// role + connection scope, plus short-lived login sessions.
package account

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrNotFound           = errors.New("user not found")
	ErrExists             = errors.New("user already exists")
	ErrInvalidCredentials = errors.New("invalid username or password")
)

// Role controls what a user may do.
type Role string

const (
	RoleAdmin    Role = "admin"    // everything, incl. users & connections
	RoleOperator Role = "operator" // read/write within scope
	RoleViewer   Role = "viewer"   // read-only within scope
)

func ValidRole(r Role) bool {
	return r == RoleAdmin || r == RoleOperator || r == RoleViewer
}

// User is a persisted account. Connections empty means "all connections".
type User struct {
	Username     string    `json:"username"`
	PasswordHash string    `json:"passwordHash"`
	Role         Role      `json:"role"`
	Connections  []string  `json:"connections,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// PublicUser is the redacted representation sent to clients.
type PublicUser struct {
	Username    string    `json:"username"`
	Role        Role      `json:"role"`
	Connections []string  `json:"connections"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (u User) Public() PublicUser {
	conns := u.Connections
	if conns == nil {
		conns = []string{}
	}
	return PublicUser{
		Username:    u.Username,
		Role:        u.Role,
		Connections: conns,
		CreatedAt:   u.CreatedAt,
		UpdatedAt:   u.UpdatedAt,
	}
}

// Allows reports whether the user may access the given connection id.
func (u User) Allows(connID string) bool {
	if len(u.Connections) == 0 {
		return true
	}
	for _, c := range u.Connections {
		if c == "*" || c == connID {
			return true
		}
	}
	return false
}

type fileFormat struct {
	Version int    `json:"version"`
	Users   []User `json:"users"`
}

// Store is a JSON-backed user store.
type Store struct {
	mu    sync.RWMutex
	path  string
	users map[string]User
}

func New(path string) (*Store, error) {
	s := &Store{path: path, users: map[string]User{}}
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
	var ff fileFormat
	if err := json.Unmarshal(data, &ff); err != nil {
		return nil, err
	}
	for _, u := range ff.Users {
		s.users[u.Username] = u
	}
	return s, nil
}

func (s *Store) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.users)
}

// AdminCount returns how many admin users exist.
func (s *Store) AdminCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n := 0
	for _, u := range s.users {
		if u.Role == RoleAdmin {
			n++
		}
	}
	return n
}

func (s *Store) List() []PublicUser {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]PublicUser, 0, len(s.users))
	for _, u := range s.users {
		out = append(out, u.Public())
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Username < out[j].Username })
	return out
}

func (s *Store) Get(username string) (User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[username]
	if !ok {
		return User{}, ErrNotFound
	}
	return u, nil
}

// Authenticate verifies a username/password pair.
func (s *Store) Authenticate(username, password string) (User, error) {
	s.mu.RLock()
	u, ok := s.users[username]
	s.mu.RUnlock()
	if !ok {
		// Constant-ish time: still run a bcrypt comparison against a dummy hash.
		_ = bcrypt.CompareHashAndPassword([]byte("$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid"), []byte(password))
		return User{}, ErrInvalidCredentials
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) != nil {
		return User{}, ErrInvalidCredentials
	}
	return u, nil
}

func hashPassword(password string) (string, error) {
	if len(password) < 6 {
		return "", errors.New("password must be at least 6 characters")
	}
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (s *Store) Create(username, password string, role Role, conns []string) (User, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return User{}, errors.New("username is required")
	}
	if !ValidRole(role) {
		return User{}, errors.New("role must be admin, operator or viewer")
	}
	hash, err := hashPassword(password)
	if err != nil {
		return User{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.users[username]; ok {
		return User{}, ErrExists
	}
	now := time.Now().UTC()
	u := User{Username: username, PasswordHash: hash, Role: role, Connections: normalize(conns), CreatedAt: now, UpdatedAt: now}
	s.users[username] = u
	return u, s.saveLocked()
}

func (s *Store) Update(username string, role *Role, conns *[]string, password *string) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if !ok {
		return User{}, ErrNotFound
	}
	if role != nil {
		if !ValidRole(*role) {
			return User{}, errors.New("invalid role")
		}
		u.Role = *role
	}
	if conns != nil {
		u.Connections = normalize(*conns)
	}
	if password != nil && *password != "" {
		hash, err := hashPassword(*password)
		if err != nil {
			return User{}, err
		}
		u.PasswordHash = hash
	}
	u.UpdatedAt = time.Now().UTC()
	s.users[username] = u
	return u, s.saveLocked()
}

func (s *Store) Delete(username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.users[username]; !ok {
		return ErrNotFound
	}
	delete(s.users, username)
	return s.saveLocked()
}

func normalize(conns []string) []string {
	out := make([]string, 0, len(conns))
	seen := map[string]bool{}
	for _, c := range conns {
		c = strings.TrimSpace(c)
		if c == "" || seen[c] {
			continue
		}
		seen[c] = true
		out = append(out, c)
	}
	return out
}

func (s *Store) saveLocked() error {
	ff := fileFormat{Version: 1, Users: make([]User, 0, len(s.users))}
	for _, u := range s.users {
		ff.Users = append(ff.Users, u)
	}
	sort.Slice(ff.Users, func(i, j int) bool { return ff.Users[i].Username < ff.Users[j].Username })
	data, err := json.MarshalIndent(ff, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}
