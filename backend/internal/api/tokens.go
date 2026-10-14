package api

import (
	"errors"
	"net/http"
	"time"

	"redisui/internal/account"
)

type tokenCreateRequest struct {
	Name        string   `json:"name"`
	Scopes      []string `json:"scopes"`
	Connections []string `json:"connections"`
	TTLHours    int      `json:"ttlHours"`
}

func (s *Server) listTokens(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	if s.tokens == nil {
		writeJSON(w, http.StatusOK, map[string]any{"tokens": []account.PublicToken{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tokens": s.tokens.List()})
}

func (s *Server) createToken(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	if s.tokens == nil {
		writeErr(w, http.StatusBadRequest, errString("token store is not configured"))
		return
	}
	var req tokenCreateRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	ttl := time.Duration(req.TTLHours) * time.Hour
	createdBy := principalFrom(r).Username
	plain, tok, err := s.tokens.Create(req.Name, req.Scopes, req.Connections, ttl, createdBy)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, account.ErrInvalidScope) {
			status = http.StatusBadRequest
		}
		writeErr(w, status, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"token":  plain, // shown once
		"record": tok.Public(),
	})
}

func (s *Server) deleteToken(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	if s.tokens == nil {
		writeErr(w, http.StatusBadRequest, errString("token store is not configured"))
		return
	}
	id := r.PathValue("id")
	if err := s.tokens.Delete(id); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, account.ErrTokenNotFound) {
			status = http.StatusNotFound
		}
		writeErr(w, status, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": id})
}
