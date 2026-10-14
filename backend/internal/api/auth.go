package api

import (
	"crypto/subtle"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	maxAuthFailures = 8
	authLockout     = time.Minute
)

type failureRecord struct {
	count int
	until time.Time
}

// authLimiter throttles failed authentication attempts per client IP to make
// brute-forcing the access token impractical.
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

// clientIP returns the best-effort client address. X-Forwarded-For is only
// honored when the server is explicitly told it sits behind a trusted proxy,
// otherwise it could be spoofed to bypass the login limiter.
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

// withAuth gates every /api/* route behind the access token. The health and
// auth-status endpoints stay open so probes and the login screen work.
func (s *Server) withAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.authToken == "" ||
			!strings.HasPrefix(r.URL.Path, "/api/") ||
			r.URL.Path == "/api/health" ||
			r.URL.Path == "/api/auth/status" {
			next.ServeHTTP(w, r)
			return
		}

		ip := s.clientIP(r)
		if !s.limiter.allow(ip) {
			w.Header().Set("Retry-After", "60")
			writeErr(w, http.StatusTooManyRequests, errString("too many failed authentication attempts, try again later"))
			return
		}

		got := bearerToken(r)
		if subtle.ConstantTimeCompare([]byte(got), []byte(s.authToken)) != 1 {
			s.limiter.fail(ip)
			writeErr(w, http.StatusUnauthorized, errString("unauthorized: a valid access token is required"))
			return
		}
		s.limiter.reset(ip)
		next.ServeHTTP(w, r)
	})
}

func (s *Server) authStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"required": s.authToken != "",
	})
}

func (s *Server) authVerify(w http.ResponseWriter, r *http.Request) {
	// Reaching this handler means withAuth accepted the token.
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
