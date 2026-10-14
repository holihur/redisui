package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"redisui/internal/model"
	"redisui/internal/redisclient"
	"redisui/internal/session"
)

func (s *Server) session(w http.ResponseWriter, r *http.Request) (*redisclient.Session, bool) {
	sid := r.PathValue("sid")
	sess, err := s.sessions.Get(sid)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, session.ErrNotFound) {
			status = http.StatusNotFound
		}
		writeErr(w, status, err)
		return nil, false
	}
	return sess, true
}

func (s *Server) listSessions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.sessions.List())
}

func (s *Server) openSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	conn, err := s.store.Get(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}

	ctx, cancel := contextWithTimeout(r, 20*time.Second)
	defer cancel()

	// One live session per profile keeps things predictable.
	s.sessions.CloseByConn(id)
	sess, err := s.sessions.Open(ctx, newID(), conn)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "session": sess.Info()})
}

func (s *Server) closeSession(w http.ResponseWriter, r *http.Request) {
	if err := s.sessions.Close(r.PathValue("sid")); err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) databases(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()
	dbs, err := sess.Databases(ctx, queryInt(r, "db", 0))
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, dbs)
}

func (s *Server) serverInfo(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()
	info, err := sess.ServerInfo(ctx, queryInt(r, "db", 0))
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) scanKeys(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	cursor, _ := strconv.ParseUint(q.Get("cursor"), 10, 64)
	withSize := q.Get("size") == "1" || q.Get("size") == "true"

	ctx, cancel := contextWithTimeout(r, 30*time.Second)
	defer cancel()

	keys, next, err := sess.ScanKeys(ctx, queryInt(r, "db", 0), cursor, q.Get("match"), int64(queryInt(r, "count", 100)), q.Get("type"), withSize)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	if keys == nil {
		keys = []redisclient.KeyInfo{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": keys, "cursor": next})
}

func (s *Server) getKey(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	key := q.Get("key")
	if key == "" {
		writeErr(w, http.StatusBadRequest, errString("key is required"))
		return
	}
	cursor, _ := strconv.ParseUint(q.Get("cursor"), 10, 64)

	ctx, cancel := contextWithTimeout(r, 30*time.Second)
	defer cancel()

	detail, err := sess.GetKey(ctx, queryInt(r, "db", 0), key, cursor, int64(queryInt(r, "count", 100)), q.Get("match"))
	if err != nil {
		status := http.StatusBadGateway
		if errors.Is(err, redisclient.ErrKeyNotFound) {
			status = http.StatusNotFound
		}
		writeErr(w, status, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) mutateKey(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	var m redisclient.Mutation
	if err := decode(r, &m); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if r.Method == http.MethodDelete {
		m.Action = "delete"
		m.Key = r.URL.Query().Get("key")
		m.DB = queryInt(r, "db", 0)
	}
	ctx, cancel := contextWithTimeout(r, 30*time.Second)
	defer cancel()
	res, err := sess.Apply(ctx, m)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "result": res})
}

func (s *Server) deleteKey(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	key := r.URL.Query().Get("key")
	if key == "" {
		writeErr(w, http.StatusBadRequest, errString("key is required"))
		return
	}
	ctx, cancel := contextWithTimeout(r, 30*time.Second)
	defer cancel()
	n, err := sess.Delete(ctx, queryInt(r, "db", 0), key)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": n})
}

type commandRequest struct {
	DB      int      `json:"db"`
	Command string   `json:"command"`
	Args    []string `json:"args"`
}

func (s *Server) command(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	var req commandRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}

	ctx, cancel := contextWithTimeout(r, 30*time.Second)
	defer cancel()

	var (
		res any
		err error
	)
	if len(req.Args) > 0 {
		res, err = sess.RunCommandArgs(ctx, req.DB, req.Args)
	} else {
		res, err = sess.RunCommand(ctx, req.DB, strings.TrimSpace(req.Command))
	}
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "result": res})
}

var _ = model.Connection{}
