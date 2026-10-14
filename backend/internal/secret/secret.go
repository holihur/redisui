// Package secret provides AES-256-GCM encryption for secrets at rest
// (Redis passwords, SSH keys) and helpers to load or create the master key.
package secret

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// prefix marks a value as ciphertext produced by this package. It doubles as a
// version tag so the format can evolve without breaking existing data.
const prefix = "enc:v1:"

// Cipher encrypts and decrypts individual secret strings. A nil/disabled
// cipher is a no-op passthrough and is used when no master key is available.
type Cipher struct {
	aead     cipher.AEAD
	disabled bool
}

// Disabled returns a passthrough cipher.
func Disabled() *Cipher { return &Cipher{disabled: true} }

// New builds a Cipher from a 32-byte key. A nil/empty key yields a passthrough
// cipher so the app still works without an explicit key.
func New(key []byte) (*Cipher, error) {
	if len(key) == 0 {
		return Disabled(), nil
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("secret: master key must be 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Cipher{aead: aead}, nil
}

// Encrypt seals plaintext. Empty values and already-encrypted values are
// returned unchanged, which keeps save operations idempotent.
func (c *Cipher) Encrypt(plain string) (string, error) {
	if c == nil || c.disabled || plain == "" || strings.HasPrefix(plain, prefix) {
		return plain, nil
	}
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := c.aead.Seal(nonce, nonce, []byte(plain), nil)
	return prefix + base64.RawStdEncoding.EncodeToString(sealed), nil
}

// Decrypt opens a value produced by Encrypt. Plaintext values (no prefix) are
// returned unchanged for backward compatibility.
func (c *Cipher) Decrypt(stored string) (string, error) {
	if c == nil || c.disabled || !strings.HasPrefix(stored, prefix) {
		return stored, nil
	}
	raw, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(stored, prefix))
	if err != nil {
		return "", fmt.Errorf("secret: invalid ciphertext encoding: %w", err)
	}
	ns := c.aead.NonceSize()
	if len(raw) < ns {
		return "", errors.New("secret: ciphertext too short")
	}
	plain, err := c.aead.Open(nil, raw[:ns], raw[ns:], nil)
	if err != nil {
		return "", fmt.Errorf("secret: decryption failed: %w", err)
	}
	return string(plain), nil
}

// ResolveKey returns the master key to use, in priority order:
//  1. REDISUI_MASTER_KEY (hex-encoded 32 bytes, or any passphrase which is
//     hashed with SHA-256)
//  2. an existing key file at <dataDir>/master.key
//  3. a freshly generated key persisted to <dataDir>/master.key (0600)
//
// It returns (nil, nil) when encryption is intentionally disabled via
// REDISUI_DISABLE_ENCRYPTION=1.
func ResolveKey(dataDir string) ([]byte, string, error) {
	if v := strings.TrimSpace(os.Getenv("REDISUI_DISABLE_ENCRYPTION")); v == "1" || strings.EqualFold(v, "true") {
		return nil, "disabled", nil
	}
	if env := strings.TrimSpace(os.Getenv("REDISUI_MASTER_KEY")); env != "" {
		if b, err := hex.DecodeString(env); err == nil && len(b) == 32 {
			return b, "env:REDISUI_MASTER_KEY", nil
		}
		sum := sha256.Sum256([]byte(env))
		return sum[:], "env:REDISUI_MASTER_KEY(derived)", nil
	}

	path := filepath.Join(dataDir, "master.key")
	if data, err := os.ReadFile(path); err == nil {
		b, err := hex.DecodeString(strings.TrimSpace(string(data)))
		if err != nil || len(b) != 32 {
			return nil, "", fmt.Errorf("secret: invalid key file %s", path)
		}
		return b, "file:" + path, nil
	}

	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, "", err
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, "", err
	}
	if err := os.WriteFile(path, []byte(hex.EncodeToString(key)), 0o600); err != nil {
		return nil, "", err
	}
	return key, "file:" + path + " (generated)", nil
}

// GenerateToken returns a random 32-byte hex access token.
func GenerateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
