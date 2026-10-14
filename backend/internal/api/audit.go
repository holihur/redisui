package api

import (
	"net/http"
	"strings"
	"time"

	"redisui/internal/audit"
)

// statusWriter captures the response status for auditing while preserving the
// Flusher interface used by SSE endpoints.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// shouldAudit records mutating API calls and all auth traffic.
func shouldAudit(r *http.Request) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/") {
		return false
	}
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return strings.Contains(r.URL.Path, "/auth/")
	default:
		return true
	}
}

// withAudit must run inside withAuth so the principal is available.
func (s *Server) withAudit(next http.Handler) http.Handler {
	if s.audit == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(sw, r)
		if !shouldAudit(r) {
			return
		}
		actor, role := "anonymous", ""
		if p, ok := r.Context().Value(principalContextKey).(principal); ok {
			role = string(p.Role)
			switch {
			case p.Username != "":
				actor = p.Username
			case p.Root:
				actor = "root"
			}
		}
		status := sw.status
		if status == 0 {
			status = http.StatusOK
		}
		s.audit.Record(audit.Event{
			Time:       start.UTC(),
			Actor:      actor,
			Role:       role,
			Method:     r.Method,
			Path:       r.URL.Path,
			Status:     status,
			Remote:     s.clientIP(r),
			DurationMs: time.Since(start).Milliseconds(),
		})
	})
}

// auditRequest records an event directly (used for auth failures that never
// reach withAudit).
func (s *Server) auditRequest(r *http.Request, actor, role string, status int) {
	if s.audit == nil {
		return
	}
	s.audit.Record(audit.Event{
		Time:   time.Now().UTC(),
		Actor:  actor,
		Role:   role,
		Method: r.Method,
		Path:   r.URL.Path,
		Status: status,
		Remote: s.clientIP(r),
	})
}

func (s *Server) auditList(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	if s.audit == nil {
		writeJSON(w, http.StatusOK, map[string]any{"events": []audit.Event{}, "buffered": 0})
		return
	}
	events := s.audit.List(queryInt(r, "limit", 200), r.URL.Query().Get("actor"))
	writeJSON(w, http.StatusOK, map[string]any{"events": events, "buffered": s.audit.Count()})
}
