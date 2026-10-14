package api

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"redisui/internal/account"
	"redisui/internal/metrics"
	"redisui/internal/oidc"
)

// mockIdP is a minimal OpenID Provider for tests.
type mockIdP struct {
	t      *testing.T
	key    *rsa.PrivateKey
	server *httptest.Server

	mu        sync.Mutex
	email     string
	nonce     string
	challenge string // code_challenge captured from the authorize redirect
}

func b64url(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func (m *mockIdP) handler() http.Handler {
	mux := http.NewServeMux()
	base := func() string { return m.server.URL }

	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                 base(),
			"authorization_endpoint": base() + "/authorize",
			"token_endpoint":         base() + "/token",
			"jwks_uri":               base() + "/jwks",
		})
	})

	mux.HandleFunc("/jwks", func(w http.ResponseWriter, r *http.Request) {
		n := b64url(m.key.N.Bytes())
		e := b64url(big.NewInt(int64(m.key.E)).Bytes())
		_ = json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]any{{"kty": "RSA", "kid": "k1", "use": "sig", "n": n, "e": e}},
		})
	})

	mux.HandleFunc("/authorize", func(w http.ResponseWriter, r *http.Request) {
		m.mu.Lock()
		m.challenge = r.URL.Query().Get("code_challenge")
		m.mu.Unlock()
		http.Error(w, "not used in tests", http.StatusBadRequest)
	})

	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		m.mu.Lock()
		email, nonce, challenge := m.email, m.nonce, m.challenge
		m.mu.Unlock()

		// Verify PKCE: sha256(code_verifier) must equal the captured challenge.
		verifier := r.PostFormValue("code_verifier")
		if challenge != "" {
			sum := sha256.Sum256([]byte(verifier))
			if b64url(sum[:]) != challenge {
				http.Error(w, "pkce mismatch", http.StatusBadRequest)
				return
			}
		}
		claims := map[string]any{
			"sub": "u1", "email": email, "name": "Test User",
			"aud": "client", "iss": base(), "exp": time.Now().Add(time.Hour).Unix(), "nonce": nonce,
		}
		token := m.sign(claims)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "at", "id_token": token, "token_type": "Bearer", "expires_in": 3600,
		})
	})
	return mux
}

func (m *mockIdP) sign(claims map[string]any) string {
	header := b64url([]byte(`{"alg":"RS256","kid":"k1","typ":"JWT"}`))
	payload, _ := json.Marshal(claims)
	body := b64url(payload)
	signing := header + "." + body
	sum := sha256.Sum256([]byte(signing))
	sig, _ := rsa.SignPKCS1v15(rand.Reader, m.key, crypto.SHA256, sum[:])
	return signing + "." + b64url(sig)
}

func newTestOIDCServer(t *testing.T) (*Server, *mockIdP) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("genkey: %v", err)
	}
	idp := &mockIdP{t: t, key: key}
	idp.server = httptest.NewServer(idp.handler())
	t.Cleanup(idp.server.Close)

	provider := oidc.New(oidc.Config{
		Issuer: idp.server.URL, ClientID: "client", ClientSecret: "secret",
		RedirectURL: "http://app/api/auth/oidc/callback",
	})
	s := &Server{
		logins:     account.NewSessionManager(time.Hour),
		limiter:    newAuthLimiter(),
		metrics:    metrics.New(),
		oidc:       &OIDCConfig{Provider: provider, DefaultRole: account.RoleViewer, AllowedDomains: []string{"example.com"}, AdminEmails: []string{"boss@example.com"}},
		oidcStates: map[string]oidcState{},
	}
	return s, idp
}

func TestOIDCLoginFlow(t *testing.T) {
	s, idp := newTestOIDCServer(t)

	// 1) login -> redirect to the provider with state + PKCE challenge.
	rec := httptest.NewRecorder()
	s.oidcLogin(rec, httptest.NewRequest(http.MethodGet, "/api/auth/oidc/login", nil))
	if rec.Code != http.StatusFound {
		t.Fatalf("login status %d", rec.Code)
	}
	loc, err := url.Parse(rec.Header().Get("Location"))
	if err != nil {
		t.Fatalf("parse location: %v", err)
	}
	state := loc.Query().Get("state")
	if state == "" || loc.Query().Get("code_challenge") == "" || loc.Query().Get("code_challenge_method") != "S256" {
		t.Fatalf("missing state/pkce: %s", loc.String())
	}

	// The IdP needs the nonce the server generated for this state.
	s.oidcMu.Lock()
	nonce := s.oidcStates[state].nonce
	s.oidcMu.Unlock()
	idp.mu.Lock()
	idp.nonce = nonce
	idp.email = "alice@example.com"
	idp.challenge = loc.Query().Get("code_challenge")
	idp.mu.Unlock()

	// 2) callback -> exchange + verify + create session + redirect with token.
	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/oidc/callback?code=abc&state="+url.QueryEscape(state), nil)
	s.oidcCallback(rec, req)
	if rec.Code != http.StatusFound {
		t.Fatalf("callback status %d body=%s", rec.Code, rec.Body.String())
	}
	dest := rec.Header().Get("Location")
	idx := strings.Index(dest, "#oidc_token=")
	if idx < 0 {
		t.Fatalf("no token in redirect: %s", dest)
	}
	token := dest[idx+len("#oidc_token="):]
	token, _ = url.QueryUnescape(token)
	sess, ok := s.logins.Get(token)
	if !ok {
		t.Fatal("issued session not found")
	}
	if sess.Username != "alice@example.com" || sess.Role != account.RoleViewer {
		t.Fatalf("session = %+v", sess)
	}

	// Replaying the same state must fail.
	rec = httptest.NewRecorder()
	s.oidcCallback(rec, httptest.NewRequest(http.MethodGet, "/api/auth/oidc/callback?code=abc&state="+url.QueryEscape(state), nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("replayed state should be 400, got %d", rec.Code)
	}
}

func TestOIDCAdminAndDenied(t *testing.T) {
	s, idp := newTestOIDCServer(t)

	run := func(email string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		s.oidcLogin(rec, httptest.NewRequest(http.MethodGet, "/api/auth/oidc/login", nil))
		loc, _ := url.Parse(rec.Header().Get("Location"))
		state := loc.Query().Get("state")
		s.oidcMu.Lock()
		nonce := s.oidcStates[state].nonce
		s.oidcMu.Unlock()
		idp.mu.Lock()
		idp.nonce = nonce
		idp.email = email
		idp.challenge = loc.Query().Get("code_challenge")
		idp.mu.Unlock()
		out := httptest.NewRecorder()
		s.oidcCallback(out, httptest.NewRequest(http.MethodGet, "/api/auth/oidc/callback?code=abc&state="+url.QueryEscape(state), nil))
		return out
	}

	admin := run("boss@example.com")
	if admin.Code != http.StatusFound {
		t.Fatalf("admin login failed: %d %s", admin.Code, admin.Body.String())
	}
	dest := admin.Header().Get("Location")
	token, _ := url.QueryUnescape(dest[strings.Index(dest, "#oidc_token=")+len("#oidc_token="):])
	if sess, ok := s.logins.Get(token); !ok || sess.Role != account.RoleAdmin {
		t.Fatalf("expected admin role, got %+v", sess)
	}

	denied := run("someone@other.com")
	if denied.Code != http.StatusForbidden {
		t.Fatalf("disallowed domain should be 403, got %d", denied.Code)
	}
}
