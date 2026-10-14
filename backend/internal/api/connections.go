package api

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"sort"
	"time"

	"redisui/internal/model"
	"redisui/internal/redisclient"
	"redisui/internal/store"
)

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Server) listConnections(w http.ResponseWriter, r *http.Request) {
	p := principalFrom(r)
	conns := s.store.List()
	out := make([]model.PublicConnection, 0, len(conns))
	for _, c := range conns {
		if !p.allows(c.ID) {
			continue
		}
		out = append(out, c.Public())
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) getConnection(w http.ResponseWriter, r *http.Request) {
	c, err := s.store.Get(r.PathValue("id"))
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, store.ErrNotFound) {
			status = http.StatusNotFound
		}
		writeErr(w, status, err)
		return
	}
	if !principalFrom(r).allows(c.ID) {
		writeErr(w, http.StatusForbidden, errString("not allowed to access this connection"))
		return
	}
	writeJSON(w, http.StatusOK, c.Public())
}

func (s *Server) createConnection(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	var c model.Connection
	if err := decode(r, &c); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if c.Name == "" {
		writeErr(w, http.StatusBadRequest, errString("name is required"))
		return
	}
	switch c.EffectiveMode() {
	case model.ModeSentinel:
		if c.MasterName == "" || len(c.Sentinels) == 0 {
			writeErr(w, http.StatusBadRequest, errString("master name and at least one sentinel address are required"))
			return
		}
	case model.ModeCluster:
		if len(c.ClusterAddrs) == 0 {
			writeErr(w, http.StatusBadRequest, errString("at least one cluster address is required"))
			return
		}
	default:
		if c.Host == "" {
			writeErr(w, http.StatusBadRequest, errString("host is required"))
			return
		}
	}
	c.ID = newID()
	created, err := s.store.Create(c)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, created.Public())
}

func (s *Server) updateConnection(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	id := r.PathValue("id")
	old, err := s.store.Get(id)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, store.ErrNotFound) {
			status = http.StatusNotFound
		}
		writeErr(w, status, err)
		return
	}
	var c model.Connection
	if err := decode(r, &c); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	c.MergeSecrets(old)
	updated, err := s.store.Update(id, c)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	// Any open session is stale now.
	s.sessions.CloseByConn(id)
	writeJSON(w, http.StatusOK, updated.Public())
}

func (s *Server) deleteConnection(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	id := r.PathValue("id")
	if err := s.store.Delete(id); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, store.ErrNotFound) {
			status = http.StatusNotFound
		}
		writeErr(w, status, err)
		return
	}
	s.sessions.CloseByConn(id)
	writeJSON(w, http.StatusOK, map[string]any{"deleted": id})
}

// testConnection opens a throwaway connection to validate the credentials.
func (s *Server) testConnection(w http.ResponseWriter, r *http.Request) {
	var c model.Connection
	if err := decode(r, &c); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	// Allow testing a saved profile by id while keeping stored secrets.
	if c.ID != "" {
		if old, err := s.store.Get(c.ID); err == nil {
			if c.Mode == "" {
				c.Mode = old.EffectiveMode()
			}
			if c.Host == "" {
				c.Host = old.Host
			}
			if c.Port == 0 {
				c.Port = old.Port
			}
			if c.Username == "" {
				c.Username = old.Username
			}
			if c.Password == "" {
				c.Password = old.Password
			}
			if c.MasterName == "" {
				c.MasterName = old.MasterName
			}
			if len(c.Sentinels) == 0 {
				c.Sentinels = old.Sentinels
			}
			if len(c.ClusterAddrs) == 0 {
				c.ClusterAddrs = old.ClusterAddrs
			}
			if c.SentinelUsername == "" {
				c.SentinelUsername = old.SentinelUsername
			}
			if c.SentinelPassword == "" {
				c.SentinelPassword = old.SentinelPassword
			}
			if c.SSH == nil {
				c.SSH = old.SSH
			} else if old.SSH != nil {
				c.SSH.MergeSecrets(*old.SSH)
			}
		}
	}
	c.ApplyDefaults()

	ctx, cancel := contextWithTimeout(r, 20*time.Second)
	defer cancel()

	if err := redisclient.TestConnection(ctx, c); err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
