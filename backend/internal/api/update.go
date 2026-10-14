package api

import (
	"net/http"
	"time"
)

func (s *Server) updateStatus(w http.ResponseWriter, r *http.Request) {
	if s.updater == nil {
		writeJSON(w, http.StatusOK, map[string]any{"enabled": false})
		return
	}
	writeJSON(w, http.StatusOK, s.updater.Status())
}

func (s *Server) updateCheck(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	if s.updater == nil {
		writeErr(w, http.StatusBadRequest, errString("self-update is disabled"))
		return
	}
	ctx, cancel := contextWithTimeout(r, 30*time.Second)
	defer cancel()
	status, err := s.updater.Check(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error(), "status": status})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": status})
}

func (s *Server) updateApply(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	if s.updater == nil {
		writeErr(w, http.StatusBadRequest, errString("self-update is disabled"))
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Minute)
	defer cancel()
	status, err := s.updater.Apply(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error(), "status": status})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": status})
}
