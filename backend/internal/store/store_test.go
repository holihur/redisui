package store

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"redisui/internal/model"
	"redisui/internal/secret"
)

func newTestCipher(t *testing.T) *secret.Cipher {
	t.Helper()
	c, err := secret.New(bytes.Repeat([]byte{7}, 32))
	if err != nil {
		t.Fatalf("cipher: %v", err)
	}
	return c
}

func TestCRUD(t *testing.T) {
	s, err := New(filepath.Join(t.TempDir(), "connections.json"), newTestCipher(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	created, err := s.Create(model.Connection{ID: "a", Name: "Alpha", Host: "h1", Port: 6379})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.CreatedAt.IsZero() {
		t.Fatal("Create should set timestamps")
	}

	if _, err := s.Create(model.Connection{ID: "b", Name: "Beta", Host: "h2"}); err != nil {
		t.Fatalf("Create b: %v", err)
	}

	list := s.List()
	if len(list) != 2 || list[0].Name != "Alpha" || list[1].Name != "Beta" {
		t.Fatalf("List should be name-sorted: %+v", list)
	}

	updated, err := s.Update("a", model.Connection{Name: "Alpha2", Host: "h1"})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Name != "Alpha2" || !updated.CreatedAt.Equal(created.CreatedAt) {
		t.Fatalf("Update mismatch: %+v", updated)
	}

	if err := s.Delete("a"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.Get("a"); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestSecretsEncryptedAtRest(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "connections.json")
	cipher := newTestCipher(t)

	s, err := New(path, cipher)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	_, err = s.Create(model.Connection{
		ID:       "a",
		Name:     "Prod",
		Host:     "redis.example.com",
		Password: "topsecret",
		SSH: &model.SSHConfig{
			Enabled:    true,
			Host:       "bastion",
			Password:   "sshpass",
			PrivateKey: "PRIVATEKEY",
			Passphrase: "pp-98765",
		},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	for _, leak := range []string{"topsecret", "sshpass", "PRIVATEKEY", "pp-98765"} {
		if strings.Contains(string(raw), leak) {
			t.Fatalf("secret %q leaked to disk", leak)
		}
	}
	if !strings.Contains(string(raw), "enc:v1:") {
		t.Fatal("expected ciphertext marker on disk")
	}

	// Reload with the same key: secrets must be transparently decrypted.
	s2, err := New(path, cipher)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	got, err := s2.Get("a")
	if err != nil {
		t.Fatalf("Get after reload: %v", err)
	}
	if got.Password != "topsecret" {
		t.Fatalf("redis password not restored: %q", got.Password)
	}
	if got.SSH == nil || got.SSH.Password != "sshpass" || got.SSH.PrivateKey != "PRIVATEKEY" || got.SSH.Passphrase != "pp-98765" {
		t.Fatalf("ssh secrets not restored: %+v", got.SSH)
	}
}

func TestReloadWithWrongKeyFails(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "connections.json")
	s, _ := New(path, newTestCipher(t))
	if _, err := s.Create(model.Connection{ID: "a", Name: "x", Host: "h", Password: "p"}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	other, _ := secret.New(bytes.Repeat([]byte{9}, 32))
	if _, err := New(path, other); err == nil {
		t.Fatal("loading with the wrong key should fail")
	}
}

func TestPlaintextBackwardCompatibility(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "connections.json")
	seed, _ := New(path, secret.Disabled())
	if _, err := seed.Create(model.Connection{ID: "a", Name: "Legacy", Host: "h", Password: "old"}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	// Now load with encryption enabled: legacy plaintext must still be readable.
	s, err := New(path, newTestCipher(t))
	if err != nil {
		t.Fatalf("load legacy: %v", err)
	}
	got, _ := s.Get("a")
	if got.Password != "old" {
		t.Fatalf("legacy plaintext not read: %q", got.Password)
	}
	// Saving re-encrypts it.
	if _, err := s.Update("a", model.Connection{Name: "Legacy", Host: "h", Password: "old"}); err != nil {
		t.Fatalf("update: %v", err)
	}
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), "enc:v1:") || strings.Contains(string(raw), `"old"`) {
		t.Fatalf("expected re-encryption on save, got: %s", raw)
	}
}
