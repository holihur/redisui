package api

import (
	"net/http"
	"strings"
	"time"
)

type evalRequest struct {
	DB     int      `json:"db"`
	Script string   `json:"script"`
	SHA    string   `json:"sha"`
	Keys   []string `json:"keys"`
	Args   []string `json:"args"`
}

func (s *Server) evalScript(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	var req evalRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(req.Script) == "" && strings.TrimSpace(req.SHA) == "" {
		writeErr(w, http.StatusBadRequest, errString("script or sha is required"))
		return
	}
	ctx, cancel := contextWithTimeout(r, 30*time.Second)
	defer cancel()

	var (
		res any
		err error
	)
	// Prefer EVALSHA when a cached SHA is supplied; fall back to EVAL on NOSCRIPT.
	if strings.TrimSpace(req.SHA) != "" {
		res, err = sess.EvalSHA(ctx, req.DB, strings.TrimSpace(req.SHA), req.Keys, req.Args)
		if err != nil && req.Script != "" && strings.Contains(strings.ToUpper(err.Error()), "NOSCRIPT") {
			res, err = sess.Eval(ctx, req.DB, req.Script, req.Keys, req.Args)
		}
	} else {
		res, err = sess.Eval(ctx, req.DB, req.Script, req.Keys, req.Args)
	}
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "result": res})
}

func (s *Server) scriptLoad(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	var req evalRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(req.Script) == "" {
		writeErr(w, http.StatusBadRequest, errString("script is required"))
		return
	}
	ctx, cancel := contextWithTimeout(r, 30*time.Second)
	defer cancel()
	sha, err := sess.ScriptLoad(ctx, req.DB, req.Script)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "sha": sha})
}
