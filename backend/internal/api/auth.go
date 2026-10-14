package api

import (
	"context"
	"crypto/subtle"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"redisui/internal/account"
)

const (
	maxAuthFailures = 8
	authLockout     = time.Minute

	roleFull     = "full"
	roleReadOnly = "readonly"
)

type failureRecord struct {
	count int
	until time.Time
}

// authLimiter throttles failed authentication attempts per client IP to make
// brute-forcing credentials impractical.
type authLimiter struct {
	mu       sync.Mutex
	failures map[string]*failureRecord
}

func newAuthLimiter() *authLimiter {
	return &authLimiter{failures: map[string]*failureRecord{}}
}

func (l *authLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	rec, ok := l.failures[ip]
	if !ok {
		return true
	}
	if time.Now().After(rec.until) {
		delete(l.failures, ip)
		return true
	}
	return rec.count < maxAuthFailures
}

func (l *authLimiter) fail(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	rec := l.failures[ip]
	if rec == nil || time.Now().After(rec.until) {
		rec = &failureRecord{}
		l.failures[ip] = rec
	}
	rec.count++
	rec.until = time.Now().Add(authLockout)
}

func (l *authLimiter) reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.failures, ip)
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

type principal struct {
	Username    string
	Role        account.Role
	Connections []string
	Root        bool
}

func (p principal) allows(connID string) bool {
	if p.Root || len(p.Connections) == 0 {
		return true
	}
	for _, c := range p.Connections {
		if c == "*" || c == connID {
			return true
		}
	}
	return false
}

func (p principal) isAdmin() bool { return p.Role == account.RoleAdmin }

type contextKey int

const principalContextKey contextKey = 1

func withPrincipal(ctx context.Context, p principal) context.Context {
	return context.WithValue(ctx, principalContextKey, p)
}

// principalFrom returns the authenticated principal. When auth is disabled the
// default is a root admin so behavior matches the unauthenticated mode.
func principalFrom(r *http.Request) principal {
	if p, ok := r.Context().Value(principalContextKey).(principal); ok {
		return p
	}
	return principal{Role: account.RoleAdmin, Root: true}
}

// requireAdmin writes 403 and reports false unless the caller is an admin.
func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	if !principalFrom(r).isAdmin() {
		writeErr(w, http.StatusForbidden, errString("admin role required"))
		return false
	}
	return true
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

func (s *Server) multiUser() bool {
	return s.accounts != nil && s.accounts.Count() > 0
}

func (s *Server) authRequired() bool {
	return s.authToken != "" || s.readOnlyToken != "" || s.multiUser()
}

// clientIP returns the best-effort client address. X-Forwarded-For is only
// honored behind a trusted proxy, otherwise it could be spoofed.
func (s *Server) clientIP(r *http.Request) string {
	if s.trustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			if first, _, ok := strings.Cut(xff, ","); ok {
				return strings.TrimSpace(first)
			}
			return strings.TrimSpace(xff)
		}
		if xr := r.Header.Get("X-Real-IP"); xr != "" {
			return strings.TrimSpace(xr)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func bearerToken(r *http.Request) string {
	if h := r.Header.Get("Authorization"); h != "" {
		if after, ok := strings.CutPrefix(h, "Bearer "); ok {
			return strings.TrimSpace(after)
		}
	}
	if v := strings.TrimSpace(r.Header.Get("X-Auth-Token")); v != "" {
		return v
	}
	// Query parameter is needed for EventSource/SSE which cannot set headers.
	return r.URL.Query().Get("token")
}

func isPublicPath(path string) bool {
	switch path {
	case "/api/health", "/api/auth/status", "/api/auth/login":
		return true
	}
	return false
}

// readOnlyAllowed reports whether a read-only client may perform the request.
func readOnlyAllowed(method, path string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	case http.MethodPost:
		switch {
		case path == "/api/auth/verify" || path == "/api/auth/logout" || path == "/api/connections/test":
			return true
		case strings.HasSuffix(path, "/open"):
			return true
		}
	}
	return false
}

func (s *Server) resolvePrincipal(token string) (principal, bool) {
	if token == "" {
		return principal{}, false
	}
	if s.authToken != "" && subtle.ConstantTimeCompare([]byte(token), []byte(s.authToken)) == 1 {
		return principal{Role: account.RoleAdmin, Root: true}, true
	}
	if s.readOnlyToken != "" && subtle.ConstantTimeCompare([]byte(token), []byte(s.readOnlyToken)) == 1 {
		return principal{Role: account.RoleViewer, Root: true}, true
	}
	if s.logins != nil {
		if sess, ok := s.logins.Get(token); ok {
			return principal{Username: sess.Username, Role: sess.Role, Connections: sess.Connections}, true
		}
	}
	if s.tokens != nil {
		if t, ok := s.tokens.Authenticate(token); ok {
			return principal{Username: t.Name, Role: t.Role(), Connections: t.Connections}, true
		}
	}
	return principal{}, false
}

// withAuth gates every /api/* route behind the access token or a login session.
func (s *Server) withAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") || isPublicPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		if !s.authRequired() {
			next.ServeHTTP(w, r.WithContext(withPrincipal(r.Context(), principal{Role: account.RoleAdmin, Root: true})))
			return
		}

		ip := s.clientIP(r)
		if !s.limiter.allow(ip) {
			w.Header().Set("Retry-After", "60")
			writeErr(w, http.StatusTooManyRequests, errString("too many failed authentication attempts, try again later"))
			return
		}

		p, ok := s.resolvePrincipal(bearerToken(r))
		if !ok {
			s.limiter.fail(ip)
			writeErr(w, http.StatusUnauthorized, errString("unauthorized: sign in or provide a valid access token"))
			return
		}
		s.limiter.reset(ip)

		if p.Role == account.RoleViewer && !readOnlyAllowed(r.Method, r.URL.Path) {
			writeErr(w, http.StatusForbidden, errString("viewer role cannot perform this action"))
			return
		}
		next.ServeHTTP(w, r.WithContext(withPrincipal(r.Context(), p)))
	})
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

func (s *Server) authStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"required":  s.authRequired(),
		"multiUser": s.multiUser(),
	})
}

func (s *Server) authVerify(w http.ResponseWriter, r *http.Request) {
	// Reaching this handler means withAuth accepted the token (or auth is off).
	p, ok := s.resolvePrincipal(bearerToken(r))
	if !ok {
		p = principal{Role: account.RoleAdmin, Root: true}
	}
	role := string(p.Role)
	if p.Root && p.Role == account.RoleAdmin {
		role = roleFull
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":          true,
		"username":    p.Username,
		"role":        role,
		"connections": p.Connections,
	})
}

func (s *Server) authLogin(w http.ResponseWriter, r *http.Request) {
	if !s.multiUser() {
		writeErr(w, http.StatusBadRequest, errString("multi-user authentication is not configured"))
		return
	}
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	ip := s.clientIP(r)
	if !s.limiter.allow(ip) {
		w.Header().Set("Retry-After", "60")
		writeErr(w, http.StatusTooManyRequests, errString("too many failed login attempts, try again later"))
		return
	}
	user, err := s.accounts.Authenticate(req.Username, req.Password)
	if err != nil {
		s.limiter.fail(ip)
		writeErr(w, http.StatusUnauthorized, errString("invalid username or password"))
		return
	}
	s.limiter.reset(ip)
	token, sess := s.logins.Create(user)
	writeJSON(w, http.StatusOK, map[string]any{
		"token":       token,
		"username":    user.Username,
		"role":        user.Role,
		"connections": user.Connections,
		"expiresAt":   sess.ExpiresAt,
	})
}

func (s *Server) authLogout(w http.ResponseWriter, r *http.Request) {
	if s.logins != nil {
		s.logins.Delete(bearerToken(r))
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) authMe(w http.ResponseWriter, r *http.Request) {
	p := principalFrom(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"username":    p.Username,
		"role":        p.Role,
		"connections": p.Connections,
		"root":        p.Root,
	})
}
