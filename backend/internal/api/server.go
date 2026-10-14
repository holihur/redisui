package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"redisui/internal/session"
	"redisui/internal/store"
)

// Server holds the API dependencies.
type Server struct {
	store      *store.Store
	sessions   *session.Manager
	authToken  string
	limiter    *authLimiter
	trustProxy bool
}

// Options configures the HTTP server.
type Options struct {
	// AuthToken enables bearer-token authentication when non-empty.
	AuthToken string
	// CORSOrigin, when set, adds CORS headers (e.g. "*" or a single origin).
	CORSOrigin string
	// TrustProxy honors X-Forwarded-For / X-Real-IP for the login limiter.
	TrustProxy bool
}

// New builds the HTTP handler (API + SPA static files).
func New(st *store.Store, mgr *session.Manager, staticDir string, opts Options) http.Handler {
	s := &Server{
		store:      st,
		sessions:   mgr,
		authToken:  opts.AuthToken,
		limiter:    newAuthLimiter(),
		trustProxy: opts.TrustProxy,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.health)
	mux.HandleFunc("GET /api/auth/status", s.authStatus)
	mux.HandleFunc("POST /api/auth/verify", s.authVerify)

	mux.HandleFunc("GET /api/connections", s.listConnections)
	mux.HandleFunc("POST /api/connections", s.createConnection)
	mux.HandleFunc("POST /api/connections/test", s.testConnection)
	mux.HandleFunc("GET /api/connections/{id}", s.getConnection)
	mux.HandleFunc("PUT /api/connections/{id}", s.updateConnection)
	mux.HandleFunc("DELETE /api/connections/{id}", s.deleteConnection)

	mux.HandleFunc("GET /api/sessions", s.listSessions)
	mux.HandleFunc("POST /api/connections/{id}/open", s.openSession)
	mux.HandleFunc("DELETE /api/sessions/{sid}", s.closeSession)
	mux.HandleFunc("GET /api/sessions/{sid}/databases", s.databases)
	mux.HandleFunc("GET /api/sessions/{sid}/info", s.serverInfo)
	mux.HandleFunc("GET /api/sessions/{sid}/keys", s.scanKeys)
	mux.HandleFunc("GET /api/sessions/{sid}/key", s.getKey)
	mux.HandleFunc("PUT /api/sessions/{sid}/key", s.mutateKey)
	mux.HandleFunc("DELETE /api/sessions/{sid}/key", s.deleteKey)
	mux.HandleFunc("POST /api/sessions/{sid}/mutate", s.mutateKey)
	mux.HandleFunc("POST /api/sessions/{sid}/command", s.command)

	mux.HandleFunc("GET /api/sessions/{sid}/slowlog", s.slowlog)
	mux.HandleFunc("GET /api/sessions/{sid}/memory", s.memoryReport)
	mux.HandleFunc("GET /api/sessions/{sid}/clients", s.clients)
	mux.HandleFunc("POST /api/sessions/{sid}/bulk-delete", s.bulkDelete)
	mux.HandleFunc("GET /api/sessions/{sid}/export", s.exportKeys)
	mux.HandleFunc("POST /api/sessions/{sid}/import", s.importKeys)
	mux.HandleFunc("GET /api/sessions/{sid}/pubsub", s.pubsub)
	mux.HandleFunc("GET /api/sessions/{sid}/monitor", s.monitor)

	if staticDir != "" {
		if _, err := os.Stat(staticDir); err == nil {
			mux.Handle("/", spaHandler(staticDir))
		}
	}

	return withRecovery(withLogging(withCORS(opts.CORSOrigin, s.withAuth(mux))))
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "time": time.Now().UTC()})
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{"error": err.Error()})
}

func decode(r *http.Request, v any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

func contextWithTimeout(r *http.Request, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), d)
}

func queryInt(r *http.Request, key string, def int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func withCORS(origin string, next http.Handler) http.Handler {
	if origin == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Auth-Token")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
		}
	})
}

func withRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic: %v", rec)
				writeErr(w, http.StatusInternalServerError, errString("internal server error"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func spaHandler(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := filepath.Clean(r.URL.Path)
		path := filepath.Join(dir, clean)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			fs.ServeHTTP(w, r)
			return
		}
		// SPA fallback.
		http.ServeFile(w, r, filepath.Join(dir, "index.html"))
	})
}

type errString string

func (e errString) Error() string { return string(e) }
