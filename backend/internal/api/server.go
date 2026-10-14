package api

import (
	"context"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"redisui/internal/account"
	"redisui/internal/proxy"
	"redisui/internal/session"
	"redisui/internal/store"
	"redisui/internal/update"
)

// Server holds the API dependencies.
type Server struct {
	store         *store.Store
	sessions      *session.Manager
	accounts      *account.Store
	tokens        *account.TokenStore
	logins        *account.SessionManager
	authToken     string
	readOnlyToken string
	limiter       *authLimiter
	trustProxy    bool
	updater       *update.Updater
	proxy         *proxy.Proxy
}

// Options configures the HTTP server.
type Options struct {
	// AuthToken enables bearer-token authentication when non-empty.
	AuthToken string
	// ReadOnlyToken grants read-only access when non-empty.
	ReadOnlyToken string
	// Accounts enables multi-user login when non-nil.
	Accounts *account.Store
	// Tokens enables personal access tokens when non-nil.
	Tokens *account.TokenStore
	// StaticFS serves the frontend (embedded or os.DirFS). When nil, only the
	// API is served.
	StaticFS fs.FS
	// Update reports self-update status when non-nil.
	Update *update.Updater
	// Proxy exposes RESP proxy metrics when non-nil.
	Proxy *proxy.Proxy
	// CORSOrigin, when set, adds CORS headers (e.g. "*" or a single origin).
	CORSOrigin string
	// TrustProxy honors X-Forwarded-For / X-Real-IP for the login limiter.
	TrustProxy bool
}

// New builds the HTTP handler (API + SPA static files).
func New(st *store.Store, mgr *session.Manager, opts Options) http.Handler {
	s := &Server{
		store:         st,
		sessions:      mgr,
		accounts:      opts.Accounts,
		tokens:        opts.Tokens,
		logins:        account.NewSessionManager(12 * time.Hour),
		authToken:     opts.AuthToken,
		readOnlyToken: opts.ReadOnlyToken,
		limiter:       newAuthLimiter(),
		trustProxy:    opts.TrustProxy,
		updater:       opts.Update,
		proxy:         opts.Proxy,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.health)
	mux.HandleFunc("GET /api/auth/status", s.authStatus)
	mux.HandleFunc("POST /api/auth/verify", s.authVerify)
	mux.HandleFunc("POST /api/auth/login", s.authLogin)
	mux.HandleFunc("POST /api/auth/logout", s.authLogout)
	mux.HandleFunc("GET /api/auth/me", s.authMe)

	mux.HandleFunc("GET /api/users", s.listUsers)
	mux.HandleFunc("POST /api/users", s.createUser)
	mux.HandleFunc("PUT /api/users/{username}", s.updateUser)
	mux.HandleFunc("DELETE /api/users/{username}", s.deleteUser)
	mux.HandleFunc("GET /api/tokens", s.listTokens)
	mux.HandleFunc("POST /api/tokens", s.createToken)
	mux.HandleFunc("DELETE /api/tokens/{id}", s.deleteToken)

	mux.HandleFunc("GET /api/update", s.updateStatus)
	mux.HandleFunc("POST /api/update/check", s.updateCheck)
	mux.HandleFunc("POST /api/update/apply", s.updateApply)
	mux.HandleFunc("GET /api/proxy", s.proxyStatus)
	mux.HandleFunc("/api/mcp", s.mcp)

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
	mux.HandleFunc("GET /api/sessions/{sid}/commands", s.listCommands)
	mux.HandleFunc("POST /api/sessions/{sid}/eval", s.evalScript)
	mux.HandleFunc("POST /api/sessions/{sid}/script/load", s.scriptLoad)

	mux.HandleFunc("GET /api/sessions/{sid}/slowlog", s.slowlog)
	mux.HandleFunc("GET /api/sessions/{sid}/memory", s.memoryReport)
	mux.HandleFunc("GET /api/sessions/{sid}/clients", s.clients)
	mux.HandleFunc("POST /api/sessions/{sid}/bulk-delete", s.bulkDelete)
	mux.HandleFunc("GET /api/sessions/{sid}/export", s.exportKeys)
	mux.HandleFunc("POST /api/sessions/{sid}/import", s.importKeys)
	mux.HandleFunc("GET /api/sessions/{sid}/pubsub", s.pubsub)
	mux.HandleFunc("GET /api/sessions/{sid}/monitor", s.monitor)
	mux.HandleFunc("GET /api/sessions/{sid}/modules", s.modules)
	mux.HandleFunc("GET /api/sessions/{sid}/search/indexes", s.searchIndexes)
	mux.HandleFunc("GET /api/sessions/{sid}/search/info", s.searchInfo)
	mux.HandleFunc("POST /api/sessions/{sid}/search/index", s.createIndex)
	mux.HandleFunc("POST /api/sessions/{sid}/search/index/alter", s.alterIndex)
	mux.HandleFunc("DELETE /api/sessions/{sid}/search/index", s.dropIndex)
	mux.HandleFunc("GET /api/sessions/{sid}/search", s.search)

	if opts.StaticFS != nil {
		mux.Handle("/", spaHandler(opts.StaticFS))
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

func spaHandler(fsys fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(fsys))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}
		if info, err := fs.Stat(fsys, name); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		// SPA fallback: serve index.html for client-side routes.
		index, err := fs.ReadFile(fsys, "index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write(index)
	})
}

type errString string

func (e errString) Error() string { return string(e) }
