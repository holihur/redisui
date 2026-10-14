package account

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := New(filepath.Join(t.TempDir(), "users.json"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return s
}

func TestCreateAuthenticate(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.Create("alice", "secret123", RoleAdmin, nil); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := s.Authenticate("alice", "secret123"); err != nil {
		t.Fatalf("Authenticate correct password: %v", err)
	}
	if _, err := s.Authenticate("alice", "wrong"); err != ErrInvalidCredentials {
		t.Fatalf("wrong password -> %v", err)
	}
	if _, err := s.Authenticate("nobody", "x"); err != ErrInvalidCredentials {
		t.Fatalf("unknown user -> %v", err)
	}
	if _, err := s.Create("alice", "secret123", RoleViewer, nil); err != ErrExists {
		t.Fatalf("duplicate -> %v", err)
	}
	if _, err := s.Create("bob", "short", RoleViewer, nil); err == nil {
		t.Fatal("short password should be rejected")
	}
	if _, err := s.Create("bob", "secret123", "superuser", nil); err == nil {
		t.Fatal("invalid role should be rejected")
	}
}

func TestUpdateAndDelete(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.Create("alice", "secret123", RoleViewer, []string{"c1"}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	role := RoleOperator
	conns := []string{"c1", "c2"}
	pass := "newsecret"
	u, err := s.Update("alice", &role, &conns, &pass)
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if u.Role != RoleOperator || len(u.Connections) != 2 {
		t.Fatalf("update mismatch: %+v", u)
	}
	if _, err := s.Authenticate("alice", "newsecret"); err != nil {
		t.Fatalf("new password not applied: %v", err)
	}
	if err := s.Delete("alice"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := s.Delete("alice"); err != ErrNotFound {
		t.Fatalf("double delete -> %v", err)
	}
}

func TestPersistenceAndScoping(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "users.json")
	s, _ := New(path)
	if _, err := s.Create("alice", "secret123", RoleAdmin, nil); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := s.Create("bob", "secret123", RoleViewer, []string{"c1"}); err != nil {
		t.Fatalf("Create bob: %v", err)
	}
	if s.AdminCount() != 1 {
		t.Fatalf("admin count = %d", s.AdminCount())
	}

	s2, err := New(path)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	u, _ := s2.Get("bob")
	if u.Allows("c1") != true || u.Allows("c2") != false {
		t.Fatalf("scoping wrong: %+v", u)
	}
	b, _ := json.Marshal(u.Public())
	if strings.Contains(strings.ToLower(string(b)), "passwordhash") {
		t.Fatalf("public user must not expose a password hash: %s", b)
	}
	admin, _ := s2.Get("alice")
	if !admin.Allows("anything") {
		t.Fatal("empty scope should allow all connections")
	}
}

func TestSessionManager(t *testing.T) {
	m := NewSessionManager(time.Hour)
	token, sess := m.Create(User{Username: "alice", Role: RoleOperator, Connections: []string{"c1"}})
	if sess.Username != "alice" {
		t.Fatalf("session = %+v", sess)
	}
	got, ok := m.Get(token)
	if !ok || got.Role != RoleOperator {
		t.Fatalf("get -> %+v %v", got, ok)
	}
	m.RefreshScope(User{Username: "alice", Role: RoleAdmin})
	if got, _ := m.Get(token); got.Role != RoleAdmin {
		t.Fatalf("refresh not applied: %+v", got)
	}
	m.DeleteUser("alice")
	if _, ok := m.Get(token); ok {
		t.Fatal("session should be revoked")
	}
}

func TestSessionExpiry(t *testing.T) {
	m := NewSessionManager(time.Nanosecond)
	token, _ := m.Create(User{Username: "x", Role: RoleViewer})
	time.Sleep(2 * time.Millisecond)
	if _, ok := m.Get(token); ok {
		t.Fatal("expired session should be rejected")
	}
}
