package api

import (
	"errors"
	"net/http"

	"redisui/internal/account"
)

type userCreateRequest struct {
	Username    string       `json:"username"`
	Password    string       `json:"password"`
	Role        account.Role `json:"role"`
	Connections []string     `json:"connections"`
}

type userUpdateRequest struct {
	Password    *string       `json:"password"`
	Role        *account.Role `json:"role"`
	Connections *[]string     `json:"connections"`
}

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	if s.accounts == nil {
		writeJSON(w, http.StatusOK, map[string]any{"users": []account.PublicUser{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": s.accounts.List()})
}

func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	if s.accounts == nil {
		writeErr(w, http.StatusBadRequest, errString("multi-user authentication is not configured"))
		return
	}
	var req userCreateRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	u, err := s.accounts.Create(req.Username, req.Password, req.Role, req.Connections)
	if errors.Is(err, account.ErrExists) {
		writeErr(w, http.StatusConflict, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, u.Public())
}

func (s *Server) updateUser(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	if s.accounts == nil {
		writeErr(w, http.StatusBadRequest, errString("multi-user authentication is not configured"))
		return
	}
	username := r.PathValue("username")
	var req userUpdateRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	// Don't let the last admin demote themselves.
	if req.Role != nil && *req.Role != account.RoleAdmin && s.accounts.AdminCount() <= 1 {
		if u, err := s.accounts.Get(username); err == nil && u.Role == account.RoleAdmin {
			writeErr(w, http.StatusBadRequest, errString("cannot demote the last admin"))
			return
		}
	}
	u, err := s.accounts.Update(username, req.Role, req.Connections, req.Password)
	if errors.Is(err, account.ErrNotFound) {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	s.logins.RefreshScope(u)
	writeJSON(w, http.StatusOK, u.Public())
}

func (s *Server) deleteUser(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	if s.accounts == nil {
		writeErr(w, http.StatusBadRequest, errString("multi-user authentication is not configured"))
		return
	}
	username := r.PathValue("username")
	if u, err := s.accounts.Get(username); err == nil && u.Role == account.RoleAdmin && s.accounts.AdminCount() <= 1 {
		writeErr(w, http.StatusBadRequest, errString("cannot delete the last admin"))
		return
	}
	if err := s.accounts.Delete(username); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, account.ErrNotFound) {
			status = http.StatusNotFound
		}
		writeErr(w, status, err)
		return
	}
	s.logins.DeleteUser(username)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": username})
}
