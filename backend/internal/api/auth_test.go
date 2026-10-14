package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"redisui/internal/account"
)

func newAuthHandler(token string) http.Handler {
	s := &Server{authToken: token, limiter: newAuthLimiter()}
	return s.withAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
}

func newRoleAuthHandler(full, readOnly string) http.Handler {
	s := &Server{authToken: full, readOnlyToken: readOnly, limiter: newAuthLimiter()}
	return s.withAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
}

func do(h http.Handler, method, target, token string) int {
	req := httptest.NewRequest(method, target, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

func TestAuthAllowsPublicRoutes(t *testing.T) {
	h := newAuthHandler("secret")
	for _, path := range []string{"/api/health", "/api/auth/status"} {
		if code := do(h, http.MethodGet, path, ""); code != http.StatusOK {
			t.Fatalf("%s should be public, got %d", path, code)
		}
	}
}

func TestAuthDisabled(t *testing.T) {
	h := newAuthHandler("")
	if code := do(h, http.MethodGet, "/api/connections", ""); code != http.StatusOK {
		t.Fatalf("auth disabled should allow, got %d", code)
	}
}

func TestAuthRejectsMissingAndWrongToken(t *testing.T) {
	h := newAuthHandler("secret")
	if code := do(h, http.MethodGet, "/api/connections", ""); code != http.StatusUnauthorized {
		t.Fatalf("missing token should be 401, got %d", code)
	}
	if code := do(h, http.MethodGet, "/api/connections", "nope"); code != http.StatusUnauthorized {
		t.Fatalf("wrong token should be 401, got %d", code)
	}
}

func TestAuthAcceptsBearerAndQueryToken(t *testing.T) {
	h := newAuthHandler("secret")
	if code := do(h, http.MethodGet, "/api/connections", "secret"); code != http.StatusOK {
		t.Fatalf("bearer token should pass, got %d", code)
	}
	if code := do(h, http.MethodGet, "/api/connections?token=secret", ""); code != http.StatusOK {
		t.Fatalf("query token should pass (needed for SSE), got %d", code)
	}
}

func TestAuthLimiterLocksOutAfterRepeatedFailures(t *testing.T) {
	h := newAuthHandler("secret")
	for i := 0; i < maxAuthFailures; i++ {
		if code := do(h, http.MethodGet, "/api/connections", "wrong"); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected 401, got %d", i, code)
		}
	}
	if code := do(h, http.MethodGet, "/api/connections", "secret"); code != http.StatusTooManyRequests {
		t.Fatalf("expected lockout after %d failures, got %d", maxAuthFailures, code)
	}
}

func TestReadOnlyToken(t *testing.T) {
	h := newRoleAuthHandler("fulltok", "rotok")

	// Reads are allowed.
	if code := do(h, http.MethodGet, "/api/connections", "rotok"); code != http.StatusOK {
		t.Fatalf("read-only GET should pass, got %d", code)
	}
	// Opening a session is allowed (needed to browse at all).
	if code := do(h, http.MethodPost, "/api/connections/abc/open", "rotok"); code != http.StatusOK {
		t.Fatalf("read-only open should pass, got %d", code)
	}
	// Mutations are blocked.
	for _, tc := range []struct{ method, path string }{
		{http.MethodPost, "/api/sessions/s/mutate"},
		{http.MethodPost, "/api/sessions/s/command"},
		{http.MethodPost, "/api/sessions/s/import"},
		{http.MethodPost, "/api/sessions/s/bulk-delete"},
		{http.MethodDelete, "/api/sessions/s/key"},
		{http.MethodPut, "/api/connections/c"},
	} {
		if code := do(h, tc.method, tc.path, "rotok"); code != http.StatusForbidden {
			t.Fatalf("read-only %s %s should be 403, got %d", tc.method, tc.path, code)
		}
	}
	// The full token may mutate.
	if code := do(h, http.MethodPost, "/api/sessions/s/mutate", "fulltok"); code != http.StatusOK {
		t.Fatalf("full token should mutate, got %d", code)
	}
	// Unknown tokens are rejected.
	if code := do(h, http.MethodGet, "/api/connections", "nope"); code != http.StatusUnauthorized {
		t.Fatalf("unknown token should be 401, got %d", code)
	}
}

func TestResolvePrincipalRoles(t *testing.T) {
	s := &Server{authToken: "full", readOnlyToken: "ro", logins: account.NewSessionManager(time.Hour)}

	if p, ok := s.resolvePrincipal("full"); !ok || p.Role != account.RoleAdmin || !p.Root {
		t.Fatalf("full token -> %+v %v", p, ok)
	}
	if p, ok := s.resolvePrincipal("ro"); !ok || p.Role != account.RoleViewer {
		t.Fatalf("read-only token -> %+v %v", p, ok)
	}
	if _, ok := s.resolvePrincipal("x"); ok {
		t.Fatal("unknown token should not authenticate")
	}

	token, _ := s.logins.Create(account.User{Username: "alice", Role: account.RoleOperator, Connections: []string{"c1"}})
	p, ok := s.resolvePrincipal(token)
	if !ok || p.Username != "alice" || p.Role != account.RoleOperator {
		t.Fatalf("session -> %+v %v", p, ok)
	}
	if !p.allows("c1") || p.allows("c2") {
		t.Fatalf("scope not enforced: %+v", p)
	}
}

func TestAdminScope(t *testing.T) {
	admin := principal{Role: account.RoleAdmin, Root: true}
	if !admin.allows("anything") || !admin.isAdmin() {
		t.Fatal("root admin should allow everything")
	}
	scoped := principal{Role: account.RoleOperator, Connections: []string{"a"}}
	if !scoped.allows("a") || scoped.allows("b") || scoped.isAdmin() {
		t.Fatalf("scoped operator wrong: %+v", scoped)
	}
}

func TestBearerTokenExtraction(t *testing.T) {
	cases := []struct {
		auth   string
		header string
		query  string
		want   string
	}{
		{auth: "Bearer abc", want: "abc"},
		{auth: "Basic abc", want: ""},
		{header: "hdr-token", want: "hdr-token"},
		{query: "q-token", want: "q-token"},
		{want: ""},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodGet, "/api/connections", nil)
		if tc.auth != "" {
			req.Header.Set("Authorization", tc.auth)
		}
		if tc.header != "" {
			req.Header.Set("X-Auth-Token", tc.header)
		}
		if tc.query != "" {
			q := req.URL.Query()
			q.Set("token", tc.query)
			req.URL.RawQuery = q.Encode()
		}
		if got := bearerToken(req); got != tc.want {
			t.Fatalf("bearerToken(%+v) = %q, want %q", tc, got, tc.want)
		}
	}
}
