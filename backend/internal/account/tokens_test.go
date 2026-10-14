package account

import (
	"path/filepath"
	"testing"
	"time"
)

func TestTokenCreateAndAuthenticate(t *testing.T) {
	s, err := NewTokenStore(filepath.Join(t.TempDir(), "tokens.json"))
	if err != nil {
		t.Fatalf("NewTokenStore: %v", err)
	}
	plain, tok, err := s.Create("ci", []string{"read", "write"}, []string{"c1"}, 0, "admin")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if len(plain) < 20 || tok.Prefix == "" {
		t.Fatalf("unexpected token: %q %+v", plain, tok)
	}
	if tok.Role() != RoleOperator {
		t.Fatalf("role = %v", tok.Role())
	}
	if !tok.Allows("c1") || tok.Allows("c2") {
		t.Fatalf("scope wrong: %+v", tok)
	}

	got, ok := s.Authenticate(plain)
	if !ok || got.ID != tok.ID {
		t.Fatalf("authenticate failed: %v %+v", ok, got)
	}
	if got.LastUsedAt == nil {
		t.Fatal("LastUsedAt should be set")
	}
	if _, ok := s.Authenticate("redisui_pat_deadbeef"); ok {
		t.Fatal("unknown token should not authenticate")
	}
	if _, ok := s.Authenticate("not-a-pat"); ok {
		t.Fatal("non-pat string should not authenticate")
	}
}

func TestTokenScopesAndValidation(t *testing.T) {
	s, _ := NewTokenStore(filepath.Join(t.TempDir(), "tokens.json"))
	if _, _, err := s.Create("bad", []string{"root"}, nil, 0, ""); err != ErrInvalidScope {
		t.Fatalf("invalid scope -> %v", err)
	}
	if _, _, err := s.Create("", []string{"read"}, nil, 0, ""); err == nil {
		t.Fatal("empty name should fail")
	}
	_, admin, _ := s.Create("a", []string{"admin"}, nil, 0, "")
	if admin.Role() != RoleAdmin {
		t.Fatalf("admin role = %v", admin.Role())
	}
	_, reader, _ := s.Create("r", nil, nil, 0, "")
	if reader.Role() != RoleViewer {
		t.Fatalf("default role = %v", reader.Role())
	}
}

func TestTokenExpiry(t *testing.T) {
	s, _ := NewTokenStore(filepath.Join(t.TempDir(), "tokens.json"))
	plain, _, _ := s.Create("short", []string{"read"}, nil, time.Millisecond, "")
	time.Sleep(5 * time.Millisecond)
	if _, ok := s.Authenticate(plain); ok {
		t.Fatal("expired token should not authenticate")
	}
}
