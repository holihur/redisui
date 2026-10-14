package secret

import (
	"bytes"
	"strings"
	"testing"
)

func testKey() []byte { return bytes.Repeat([]byte{0x42}, 32) }

func TestEncryptDecryptRoundTrip(t *testing.T) {
	c, err := New(testKey())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	ct, err := c.Encrypt("hunter2")
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	if !strings.HasPrefix(ct, prefix) {
		t.Fatalf("ciphertext missing prefix: %q", ct)
	}
	if strings.Contains(ct, "hunter2") {
		t.Fatalf("ciphertext leaks plaintext: %q", ct)
	}
	pt, err := c.Decrypt(ct)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if pt != "hunter2" {
		t.Fatalf("round trip mismatch: %q", pt)
	}
}

func TestEncryptEmptyAndIdempotent(t *testing.T) {
	c, _ := New(testKey())
	if got, _ := c.Encrypt(""); got != "" {
		t.Fatalf("empty should stay empty, got %q", got)
	}
	ct, _ := c.Encrypt("x")
	again, _ := c.Encrypt(ct)
	if again != ct {
		t.Fatalf("encrypt should be idempotent on ciphertext")
	}
	if pt, _ := c.Decrypt("plain"); pt != "plain" {
		t.Fatalf("plaintext should pass through decrypt")
	}
}

func TestDisabledIsPassthrough(t *testing.T) {
	c := Disabled()
	ct, _ := c.Encrypt("secret")
	if ct != "secret" {
		t.Fatalf("disabled encrypt changed value: %q", ct)
	}
	pt, _ := c.Decrypt("enc:v1:whatever")
	if pt != "enc:v1:whatever" {
		t.Fatalf("disabled decrypt should not touch value")
	}
}

func TestWrongKeyFailsToDecrypt(t *testing.T) {
	c1, _ := New(bytes.Repeat([]byte{1}, 32))
	c2, _ := New(bytes.Repeat([]byte{2}, 32))
	ct, _ := c1.Encrypt("secret")
	if _, err := c2.Decrypt(ct); err == nil {
		t.Fatal("expected decryption with wrong key to fail")
	}
}

func TestTamperDetection(t *testing.T) {
	c, _ := New(testKey())
	ct, _ := c.Encrypt("secret")
	tampered := ct[:len(ct)-2] + "AA"
	if tampered == ct {
		t.Skip("tamper produced identical value")
	}
	if _, err := c.Decrypt(tampered); err == nil {
		t.Fatal("expected tampered ciphertext to fail authentication")
	}
}

func TestResolveKeyPersists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REDISUI_MASTER_KEY", "")
	t.Setenv("REDISUI_DISABLE_ENCRYPTION", "")
	k1, src1, err := ResolveKey(dir)
	if err != nil {
		t.Fatalf("ResolveKey: %v", err)
	}
	if len(k1) != 32 || !strings.Contains(src1, "generated") {
		t.Fatalf("unexpected key/source: len=%d src=%q", len(k1), src1)
	}
	k2, _, err := ResolveKey(dir)
	if err != nil {
		t.Fatalf("ResolveKey second: %v", err)
	}
	if !bytes.Equal(k1, k2) {
		t.Fatal("re-resolving should reuse the persisted key")
	}
}

func TestResolveKeyFromEnv(t *testing.T) {
	t.Setenv("REDISUI_MASTER_KEY", "passphrase")
	k, src, err := ResolveKey(t.TempDir())
	if err != nil {
		t.Fatalf("ResolveKey: %v", err)
	}
	if len(k) != 32 {
		t.Fatalf("derived key must be 32 bytes, got %d", len(k))
	}
	if !strings.Contains(src, "derived") {
		t.Fatalf("unexpected source: %q", src)
	}
}

func TestGenerateToken(t *testing.T) {
	t1, err := GenerateToken()
	if err != nil {
		t.Fatalf("GenerateToken: %v", err)
	}
	if len(t1) != 64 {
		t.Fatalf("token should be 64 hex chars, got %d", len(t1))
	}
	t2, _ := GenerateToken()
	if t1 == t2 {
		t.Fatal("tokens should be unique")
	}
}
