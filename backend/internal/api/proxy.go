package api

import "net/http"

func (s *Server) proxyStatus(w http.ResponseWriter, r *http.Request) {
	if s.proxy == nil {
		writeJSON(w, http.StatusOK, map[string]any{"running": false})
		return
	}
	writeJSON(w, http.StatusOK, s.proxy.Snapshot())
}
