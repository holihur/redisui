package main

import (
	"context"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"redisui/internal/api"
	"redisui/internal/secret"
	"redisui/internal/session"
	"redisui/internal/store"
)

func main() {
	addr := flag.String("addr", "0.0.0.0:8080", "HTTP listen address; use 127.0.0.1:8080 to restrict to this host")
	dataDir := flag.String("data", "./data", "directory for persisted connection profiles and keys")
	staticDir := flag.String("static", "./web", "directory containing the built frontend")
	authToken := flag.String("auth-token", "", "access token for remote clients (default: REDISUI_AUTH_TOKEN env, then a generated token in <data>/token)")
	noAuth := flag.Bool("no-auth", false, "disable authentication (only safe on a trusted, non-public network)")
	readOnlyToken := flag.String("readonly-token", "", "read-only access token: GET requests and open-session only")
	tlsCert := flag.String("tls-cert", "", "TLS certificate file; enables HTTPS together with -tls-key")
	tlsKey := flag.String("tls-key", "", "TLS private key file")
	corsOrigin := flag.String("cors-origin", "", "allowed CORS origin; empty keeps the API same-origin only")
	trustProxy := flag.Bool("trust-proxy", false, "trust X-Forwarded-For/X-Real-IP from a reverse proxy")
	flag.Parse()

	// --- secrets at rest ---------------------------------------------------
	key, keySource, err := secret.ResolveKey(*dataDir)
	if err != nil {
		log.Fatalf("resolve master key: %v", err)
	}
	cipher, err := secret.New(key)
	if err != nil {
		log.Fatalf("init cipher: %v", err)
	}
	log.Printf("credential encryption: %s", keySource)

	// --- access token ------------------------------------------------------
	requireAuth := !*noAuth
	token := ""
	if requireAuth {
		token = strings.TrimSpace(*authToken)
		if token == "" {
			token = strings.TrimSpace(os.Getenv("REDISUI_AUTH_TOKEN"))
		}
		if token == "" {
			token, err = loadOrCreateToken(*dataDir)
			if err != nil {
				log.Fatalf("resolve access token: %v", err)
			}
		}
	}

	if !requireAuth {
		log.Printf("WARNING: authentication is disabled (-no-auth). Anyone who can reach %s can control your Redis servers.", *addr)
	} else if isPubliclyBound(*addr) {
		log.Printf("remote access enabled on %s; keep this token secret.", *addr)
		log.Printf("access token: %s", token)
		log.Printf("(also stored at %s; set -auth-token or REDISUI_AUTH_TOKEN to override)", filepath.Join(*dataDir, "token"))
	}

	roToken := ""
	if requireAuth {
		roToken = strings.TrimSpace(*readOnlyToken)
		if roToken == "" {
			roToken = strings.TrimSpace(os.Getenv("REDISUI_READONLY_TOKEN"))
		}
		if roToken != "" {
			log.Printf("read-only token enabled (GET requests only)")
		}
	}

	if (*tlsCert == "") != (*tlsKey == "") {
		log.Fatalf("must provide both -tls-cert and -tls-key")
	}
	scheme := "http"
	if *tlsCert != "" {
		scheme = "https"
	}
	if isPubliclyBound(*addr) && *tlsCert == "" {
		log.Printf("WARNING: serving over plain %s on a public interface; put it behind HTTPS (reverse proxy) or pass -tls-cert/-tls-key.", scheme)
	}

	// --- wire up -----------------------------------------------------------
	st, err := store.New(filepath.Join(*dataDir, "connections.json"), cipher)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}

	mgr := session.NewManager()
	defer mgr.CloseAll()

	srv := &http.Server{
		Addr:              *addr,
		Handler:           api.New(st, mgr, *staticDir, api.Options{AuthToken: token, ReadOnlyToken: roToken, CORSOrigin: *corsOrigin, TrustProxy: *trustProxy}),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("redisui listening on %s (data=%s static=%s auth=%v tls=%v)", *addr, *dataDir, *staticDir, requireAuth, *tlsCert != "")
		var serveErr error
		if *tlsCert != "" {
			serveErr = srv.ListenAndServeTLS(*tlsCert, *tlsKey)
		} else {
			serveErr = srv.ListenAndServe()
		}
		if serveErr != nil && serveErr != http.ErrServerClosed {
			log.Fatalf("listen: %v", serveErr)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Println("shutting down…")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
	mgr.CloseAll()
}

// loadOrCreateToken reuses a previously generated token so clients keep working
// across restarts, generating one on first run.
func loadOrCreateToken(dataDir string) (string, error) {
	path := filepath.Join(dataDir, "token")
	if data, err := os.ReadFile(path); err == nil {
		if t := strings.TrimSpace(string(data)); t != "" {
			return t, nil
		}
	}
	token, err := secret.GenerateToken()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return "", err
	}
	if err := os.WriteFile(path, []byte(token+"\n"), 0o600); err != nil {
		return "", err
	}
	return token, nil
}

// isPubliclyBound reports whether addr listens on anything other than loopback.
func isPubliclyBound(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		return true
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return true // hostname: assume it may be reachable
	}
	return !ip.IsLoopback()
}
