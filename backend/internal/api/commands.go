package api

import (
	"net/http"
	"time"
)

func (s *Server) listCommands(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()
	cmds, err := sess.Commands(ctx, queryInt(r, "db", 0))
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"commands": cmds})
}
