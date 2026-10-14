package api

import (
	"net/http"
	"strings"
)

func (s *Server) authFailure() {
	if s.metrics != nil {
		s.metrics.AuthFailure()
	}
}

func (s *Server) withMetrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		sw := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(sw, r)
		status := sw.status
		if status == 0 {
			status = http.StatusOK
		}
		if s.metrics != nil {
			s.metrics.Observe(r.Method, status)
		}
	})
}

func (s *Server) metricsHandler(w http.ResponseWriter, r *http.Request) {
	gauges := map[string]float64{
		"redisui_sessions_active": float64(len(s.sessions.List())),
		"redisui_connections":     float64(len(s.store.List())),
	}
	if s.accounts != nil {
		gauges["redisui_users"] = float64(s.accounts.Count())
	}
	if s.tokens != nil {
		gauges["redisui_tokens"] = float64(len(s.tokens.List()))
	}
	if s.audit != nil {
		gauges["redisui_audit_buffered"] = float64(s.audit.Count())
	}
	if s.proxy != nil {
		snap := s.proxy.Snapshot()
		gauges["redisui_proxy_up_bytes_total"] = float64(snap.Up)
		gauges["redisui_proxy_down_bytes_total"] = float64(snap.Down)
		gauges["redisui_proxy_commands_total"] = float64(snap.Commands)
		gauges["redisui_proxy_connections_active"] = float64(snap.Active)
	}
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	_, _ = w.Write([]byte(s.metrics.Render(gauges)))
}
