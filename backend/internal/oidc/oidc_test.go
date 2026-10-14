package oidc

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"math/big"
	"strings"
	"testing"
	"time"
)

func b64url(s string) string { return base64.RawURLEncoding.EncodeToString([]byte(s)) }

func signRS256(t *testing.T, key *rsa.PrivateKey, payload string) (string, map[string]crypto.PublicKey) {
	t.Helper()
	n := base64.RawURLEncoding.EncodeToString(key.N.Bytes())
	e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())
	jwks := fmt.Sprintf(`{"keys":[{"kty":"RSA","kid":"k1","use":"sig","n":%q,"e":%q}]}`, n, e)
	keys, err := parseJWKS(strings.NewReader(jwks))
	if err != nil {
		t.Fatalf("parseJWKS: %v", err)
	}
	header := b64url(`{"alg":"RS256","kid":"k1","typ":"JWT"}`)
	body := b64url(payload)
	signing := header + "." + body
	sum := sha256.Sum256([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return signing + "." + base64.RawURLEncoding.EncodeToString(sig), keys
}

func TestVerifyIDToken(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("genkey: %v", err)
	}
	payload := `{"sub":"u1","email":"alice@example.com","name":"Alice","aud":"client","iss":"https://issuer","exp":9999999999,"nonce":"n1"}`
	token, keys := signRS256(t, key, payload)

	p := New(Config{Issuer: "https://issuer", ClientID: "client"})
	// Inject the JWKS to avoid network discovery.
	p.jwks = keys
	p.jwksAt = time.Now()

	claims, err := p.VerifyIDToken(t.Context(), token, "n1")
	if err != nil {
		t.Fatalf("VerifyIDToken: %v", err)
	}
	if claims.Email != "alice@example.com" || claims.Subject != "u1" {
		t.Fatalf("claims = %+v", claims)
	}

	if _, err := p.VerifyIDToken(t.Context(), token, "wrong-nonce"); err == nil {
		t.Fatal("nonce mismatch should fail")
	}

	badAud := `{"sub":"u1","aud":"other","iss":"https://issuer","exp":9999999999,"nonce":"n1"}`
	badTok, _ := signRS256(t, key, badAud)
	if _, err := p.VerifyIDToken(t.Context(), badTok, "n1"); err == nil {
		t.Fatal("audience mismatch should fail")
	}

	expired := `{"sub":"u1","aud":"client","iss":"https://issuer","exp":1,"nonce":"n1"}`
	expTok, _ := signRS256(t, key, expired)
	if _, err := p.VerifyIDToken(t.Context(), expTok, "n1"); err == nil {
		t.Fatal("expired token should fail")
	}
}

func TestAudienceContains(t *testing.T) {
	if !audienceContains("client", "client") {
		t.Fatal("string audience")
	}
	if !audienceContains([]any{"a", "client"}, "client") {
		t.Fatal("array audience")
	}
	if audienceContains([]any{"a"}, "client") {
		t.Fatal("should not match")
	}
}

func TestAuthorizeConfig(t *testing.T) {
	// Exercised indirectly via OIDCConfig in the api package; here we only check
	// the claims struct wiring.
	c := &Claims{Email: "a@b.c", Subject: "s"}
	if c.Email != "a@b.c" {
		t.Fatal("claims")
	}
}
