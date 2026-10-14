package main

import (
	"context"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"redisui/internal/account"
	"redisui/internal/api"
	"redisui/internal/proxy"
	"redisui/internal/secret"
	"redisui/internal/session"
	"redisui/internal/store"
	"redisui/internal/update"
)

// version is injected at build time with -ldflags "-X main.version=...".
var version = "dev"

func main() {
	addr := flag.String("addr", "0.0.0.0:8080", "HTTP listen address; use 127.0.0.1:8080 to restrict to this host")
	dataDir := flag.String("data", "./data", "directory for persisted connection profiles and keys")
	staticDir := flag.String("static", "", "directory containing the built frontend (default: embedded)")
	authToken := flag.String("auth-token", "", "access token for remote clients (default: REDISUI_AUTH_TOKEN env, then a generated token in <data>/token)")
	noAuth := flag.Bool("no-auth", false, "disable authentication (only safe on a trusted, non-public network)")
	readOnlyToken := flag.String("readonly-token", "", "read-only access token: GET requests and open-session only")
	tlsCert := flag.String("tls-cert", "", "TLS certificate file; enables HTTPS together with -tls-key")
	tlsKey := flag.String("tls-key", "", "TLS private key file")
	corsOrigin := flag.String("cors-origin", "", "allowed CORS origin; empty keeps the API same-origin only")
	trustProxy := flag.Bool("trust-proxy", false, "trust X-Forwarded-For/X-Real-IP from a reverse proxy")
	updateRepo := flag.String("update-repo", "holihur/redisui", "GitHub repo (owner/name) used for self-update")
	updateInterval := flag.Duration("update-interval", 10*time.Minute, "how often to check for updates")
	updateAuto := flag.Bool("update-auto", true, "automatically download and apply updates when available")
	noUpdate := flag.Bool("no-update", false, "disable the self-update checker")
	proxyAddr := flag.String("proxy-addr", "", "optional RESP proxy listen address, e.g. 0.0.0.0:6380")
	proxyTarget := flag.String("proxy-target", "", "Redis target for the proxy (host:port)")
	printVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *printVersion {
		fmt.Println(version)
		return
	}
	log.Printf("redisui %s", version)

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

	// --- accounts ----------------------------------------------------------
	accounts, err := account.New(filepath.Join(*dataDir, "users.json"))
	if err != nil {
		log.Fatalf("open accounts: %v", err)
	}
	multiUser := accounts.Count() > 0

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

	if !requireAuth && !multiUser {
		log.Printf("WARNING: authentication is disabled (-no-auth). Anyone who can reach %s can control your Redis servers.", *addr)
	} else if isPubliclyBound(*addr) {
		log.Printf("remote access enabled on %s; keep credentials secret.", *addr)
		if requireAuth {
			log.Printf("access token: %s", token)
			log.Printf("(also stored at %s; set -auth-token or REDISUI_AUTH_TOKEN to override)", filepath.Join(*dataDir, "token"))
		}
		if multiUser {
			log.Printf("multi-user enabled: %d account(s) in %s", accounts.Count(), filepath.Join(*dataDir, "users.json"))
		}
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

	staticFS, staticDesc := resolveStatic(*staticDir)

	mgr := session.NewManager()
	defer mgr.CloseAll()

	// --- self-update -------------------------------------------------------
	updateCtx, cancelUpdates := context.WithCancel(context.Background())
	defer cancelUpdates()
	var updater *update.Updater
	if !*noUpdate {
		updater = update.New(update.Config{
			Repo:      *updateRepo,
			Current:   version,
			Interval:  *updateInterval,
			Enabled:   true,
			AutoApply: *updateAuto && version != "dev",
			Restart:   restartSelf,
			Logf:      log.Printf,
		})
		go updater.Start(updateCtx)
	} else {
		log.Printf("self-update disabled (-no-update)")
	}

	// --- optional RESP proxy -------------------------------------------------
	var respProxy *proxy.Proxy
	if *proxyAddr != "" && *proxyTarget != "" {
		respProxy = proxy.New(*proxyAddr, *proxyTarget)
		if err := respProxy.Start(updateCtx); err != nil {
			log.Fatalf("start proxy: %v", err)
		}
		log.Printf("RESP proxy listening on %s -> %s", *proxyAddr, *proxyTarget)
	} else if *proxyAddr != "" || *proxyTarget != "" {
		log.Printf("WARNING: both -proxy-addr and -proxy-target are required to enable the proxy")
	}

	srv := &http.Server{
		Addr: *addr,
		Handler: api.New(st, mgr, api.Options{
			AuthToken:     token,
			ReadOnlyToken: roToken,
			Accounts:      accounts,
			StaticFS:      staticFS,
			Update:        updater,
			Proxy:         respProxy,
			CORSOrigin:    *corsOrigin,
			TrustProxy:    *trustProxy,
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("redisui listening on %s (data=%s static=%s auth=%v tls=%v)", *addr, *dataDir, staticDesc, requireAuth, *tlsCert != "")
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
	cancelUpdates()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
	mgr.CloseAll()
}

// resolveStatic picks the frontend filesystem: an explicit directory when it
// exists, otherwise the assets embedded in the binary.
func resolveStatic(dir string) (fs.FS, string) {
	if dir != "" {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			return os.DirFS(dir), dir
		}
		log.Printf("WARNING: static dir %q not found; falling back to embedded assets", dir)
	}
	if sub, ok := embeddedStatic(); ok {
		return sub, "embedded"
	}
	return nil, "none"
}

// restartSelf replaces the current process image with the (possibly updated)
// binary at the same path and arguments.
func restartSelf() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	// Let the HTTP response flush before we swap the process.
	time.Sleep(500 * time.Millisecond)
	if err := syscall.Exec(exe, os.Args, os.Environ()); err != nil {
		log.Printf("exec restart failed (%v); exiting so a supervisor can restart", err)
		os.Exit(0)
	}
	return nil
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
