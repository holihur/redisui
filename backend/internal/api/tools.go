package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"redisui/internal/redisclient"
)

// ---------------------------------------------------------------------------
// Slow log / memory / clients
// ---------------------------------------------------------------------------

func (s *Server) slowlog(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 20*time.Second)
	defer cancel()
	entries, err := sess.Slowlog(ctx, queryInt(r, "db", 0), int64(queryInt(r, "count", 100)))
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

func (s *Server) memoryReport(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 30*time.Second)
	defer cancel()
	report, err := sess.MemoryReport(ctx, queryInt(r, "db", 0), int64(queryInt(r, "sample", 1000)), queryInt(r, "limit", 20))
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, report)
}

func (s *Server) clients(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()
	list, err := sess.Clients(ctx, queryInt(r, "db", 0))
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"clients": list})
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

type bulkDeleteRequest struct {
	DB    int    `json:"db"`
	Match string `json:"match"`
}

func (s *Server) bulkDelete(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	var req bulkDeleteRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(req.Match) == "" || req.Match == "*" {
		writeErr(w, http.StatusBadRequest, errString("refusing to bulk-delete with an empty or wildcard pattern"))
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Minute)
	defer cancel()
	deleted, err := sess.DeleteByPattern(ctx, req.DB, req.Match, 500)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": deleted})
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

func (s *Server) exportKeys(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	db := queryInt(r, "db", 0)
	match := q.Get("match")
	limit := int64(queryInt(r, "limit", 1000))

	ctx, cancel := contextWithTimeout(r, 5*time.Minute)
	defer cancel()
	items, err := sess.Export(ctx, db, match, limit)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	payload := map[string]any{
		"version":  1,
		"db":       db,
		"match":    match,
		"exported": len(items),
		"keys":     items,
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", "redisui-export-db"+strconv.Itoa(db)+".json"))
	_ = json.NewEncoder(w).Encode(payload)
}

type importRequest struct {
	DB      int                      `json:"db"`
	Replace bool                     `json:"replace"`
	Keys    []redisclient.ExportItem `json:"keys"`
}

func (s *Server) importKeys(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	var req importRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if len(req.Keys) == 0 {
		writeErr(w, http.StatusBadRequest, errString("no keys to import"))
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Minute)
	defer cancel()
	imported, errs := sess.Import(ctx, req.DB, req.Keys, req.Replace)
	writeJSON(w, http.StatusOK, map[string]any{"ok": len(errs) == 0, "imported": imported, "errors": errs})
}

// ---------------------------------------------------------------------------
// Pub/Sub (Server-Sent Events)
// ---------------------------------------------------------------------------

type ssEvent struct {
	Channel string `json:"channel"`
	Pattern string `json:"pattern,omitempty"`
	Payload string `json:"payload"`
}

func splitCSV(v string) []string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func (s *Server) pubsub(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	channels := splitCSV(q.Get("channels"))
	patterns := splitCSV(q.Get("patterns"))
	if len(channels) == 0 && len(patterns) == 0 {
		writeErr(w, http.StatusBadRequest, errString("provide at least one channel or pattern"))
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, errString("streaming unsupported"))
		return
	}

	ctx := r.Context()
	ps, err := sess.Subscribe(ctx, queryInt(r, "db", 0), channels, patterns)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	defer ps.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	fmt.Fprintf(w, "event: ready\ndata: {\"channels\":%s,\"patterns\":%s}\n\n", jsonStringSlice(channels), jsonStringSlice(patterns))
	flusher.Flush()

	msgs := ps.Channel()
	keepalive := time.NewTicker(15 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-keepalive.C:
			fmt.Fprint(w, ": keepalive\n\n")
			flusher.Flush()
		case msg, ok := <-msgs:
			if !ok {
				return
			}
			data, _ := json.Marshal(ssEvent{Channel: msg.Channel, Pattern: msg.Pattern, Payload: msg.Payload})
			fmt.Fprintf(w, "event: message\ndata: %s\n\n", data)
			flusher.Flush()
		}
	}
}

func jsonStringSlice(v []string) string {
	if v == nil {
		v = []string{}
	}
	b, _ := json.Marshal(v)
	return string(b)
}

// ---------------------------------------------------------------------------
// Modules & RediSearch
// ---------------------------------------------------------------------------

func (s *Server) modules(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()
	mods, err := sess.Modules(ctx, queryInt(r, "db", 0))
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"modules": mods})
}

func (s *Server) searchIndexes(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()
	indexes, err := sess.Indexes(ctx, queryInt(r, "db", 0))
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"indexes": indexes})
}

func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	ctx, cancel := contextWithTimeout(r, 30*time.Second)
	defer cancel()
	res, err := sess.Search(ctx, queryInt(r, "db", 0), q.Get("index"), q.Get("q"),
		int64(queryInt(r, "offset", 0)), int64(queryInt(r, "limit", 25)))
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// ---------------------------------------------------------------------------
// MONITOR (Server-Sent Events) profiler
// ---------------------------------------------------------------------------

func (s *Server) monitor(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.session(w, r)
	if !ok {
		return
	}
	stream, err := sess.Monitor(r.Context(), queryInt(r, "db", 0))
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	defer stream.Close()

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, errString("streaming unsupported"))
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()
	fmt.Fprint(w, "event: ready\ndata: {}\n\n")
	flusher.Flush()

	// Unblock Next() when the client goes away.
	done := make(chan struct{})
	go func() {
		select {
		case <-r.Context().Done():
			_ = stream.Close()
		case <-done:
		}
	}()
	defer close(done)

	for {
		line, err := stream.Next()
		if err != nil {
			return
		}
		data, _ := json.Marshal(map[string]any{"line": line, "at": time.Now().UnixMilli()})
		fmt.Fprintf(w, "event: message\ndata: %s\n\n", data)
		flusher.Flush()
	}
}
