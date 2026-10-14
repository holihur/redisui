package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func newAuthHandler(token string) http.Handler {
	s := &Server{authToken: token, limiter: newAuthLimiter()}
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
