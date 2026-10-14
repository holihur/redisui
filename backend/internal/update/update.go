// Package update implements GitHub-release based self-update: it periodically
// checks for a newer release, and (when enabled) downloads, verifies and swaps
// the running binary.
package update

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Status is a snapshot of the updater state, safe to expose to clients.
type Status struct {
	Enabled         bool      `json:"enabled"`
	Current         string    `json:"current"`
	Latest          string    `json:"latest"`
	UpdateAvailable bool      `json:"updateAvailable"`
	PublishedAt     string    `json:"publishedAt,omitempty"`
	Notes           string    `json:"notes,omitempty"`
	AssetURL        string    `json:"assetUrl,omitempty"`
	CheckedAt       time.Time `json:"checkedAt,omitempty"`
	LastError       string    `json:"lastError,omitempty"`
	AutoApply       bool      `json:"autoApply"`
	IntervalSeconds int       `json:"intervalSeconds"`
}

// Config configures an Updater.
type Config struct {
	Repo      string
	Current   string
	Interval  time.Duration
	Enabled   bool
	AutoApply bool
	// Restart replaces the running process after a successful update. Defaults
	// to syscall.Exec on the same arguments.
	Restart func() error
	// Logf receives progress messages.
	Logf func(format string, args ...any)
}

// Updater checks for and applies updates.
type Updater struct {
	repo      string
	current   string
	interval  time.Duration
	enabled   bool
	autoApply bool
	restart   func() error
	logf      func(string, ...any)
	client    *http.Client

	mu     sync.Mutex
	status Status

	applyMu sync.Mutex
}

func New(cfg Config) *Updater {
	if cfg.Repo == "" {
		cfg.Repo = "holihur/redisui"
	}
	if cfg.Interval <= 0 {
		cfg.Interval = 10 * time.Minute
	}
	if cfg.Logf == nil {
		cfg.Logf = func(string, ...any) {}
	}
	u := &Updater{
		repo:      cfg.Repo,
		current:   cfg.Current,
		interval:  cfg.Interval,
		enabled:   cfg.Enabled,
		autoApply: cfg.AutoApply,
		restart:   cfg.Restart,
		logf:      cfg.Logf,
		client:    &http.Client{Timeout: 30 * time.Second},
		status: Status{
			Enabled:         cfg.Enabled,
			Current:         cfg.Current,
			AutoApply:       cfg.AutoApply,
			IntervalSeconds: int(cfg.Interval.Seconds()),
		},
	}
	return u
}

func (u *Updater) Status() Status {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.status
}

func (u *Updater) setStatus(fn func(*Status)) {
	u.mu.Lock()
	fn(&u.status)
	u.mu.Unlock()
}

// Start runs the periodic check loop until ctx is canceled.
func (u *Updater) Start(ctx context.Context) {
	if !u.enabled {
		u.logf("self-update disabled")
		return
	}
	u.logf("self-update enabled: repo=%s interval=%s auto=%v current=%s", u.repo, u.interval, u.autoApply, u.current)

	// Initial check shortly after startup.
	timer := time.NewTimer(20 * time.Second)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}

		status, err := u.Check(ctx)
		if err != nil {
			u.logf("update check failed: %v", err)
		} else if status.UpdateAvailable {
			u.logf("update available: %s -> %s", u.current, status.Latest)
			if u.autoApply {
				if _, err := u.Apply(ctx); err != nil {
					u.logf("auto-update failed: %v", err)
				} else {
					return // process is expected to restart
				}
			}
		}
		timer.Reset(u.interval)
	}
}

type ghAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type ghRelease struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	Body        string    `json:"body"`
	PublishedAt string    `json:"published_at"`
	Assets      []ghAsset `json:"assets"`
}

// Check queries GitHub for the latest release and compares versions.
func (u *Updater) Check(ctx context.Context) (Status, error) {
	if !u.enabled {
		return u.Status(), nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", u.repo), nil)
	if err != nil {
		return u.Status(), err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "redisui-updater")

	resp, err := u.client.Do(req)
	if err != nil {
		u.recordError(err)
		return u.Status(), err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		// No releases yet.
		u.setStatus(func(s *Status) { s.CheckedAt = time.Now(); s.LastError = "" })
		return u.Status(), nil
	}
	if resp.StatusCode != http.StatusOK {
		err := fmt.Errorf("github api: %s", resp.Status)
		u.recordError(err)
		return u.Status(), err
	}
	var rel ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		u.recordError(err)
		return u.Status(), err
	}

	assetName := assetFileName()
	var assetURL string
	for _, a := range rel.Assets {
		if a.Name == assetName {
			assetURL = a.BrowserDownloadURL
			break
		}
	}
	available := isNewer(u.current, rel.TagName) && assetURL != ""
	u.setStatus(func(s *Status) {
		s.Latest = rel.TagName
		s.UpdateAvailable = available
		s.PublishedAt = rel.PublishedAt
		s.Notes = truncate(rel.Body, 4000)
		s.AssetURL = assetURL
		s.CheckedAt = time.Now()
		s.LastError = ""
	})
	return u.Status(), nil
}

// Apply downloads the latest asset, verifies its checksum and swaps the binary.
func (u *Updater) Apply(ctx context.Context) (Status, error) {
	u.applyMu.Lock()
	defer u.applyMu.Unlock()

	if u.current == "" || u.current == "dev" {
		return u.Status(), errors.New("self-update is unavailable for development builds")
	}
	if runtime.GOOS == "windows" {
		return u.Status(), errors.New("self-update is not supported on Windows")
	}

	status, err := u.Check(ctx)
	if err != nil {
		return status, err
	}
	if status.Latest == "" || status.AssetURL == "" {
		return status, errors.New("no matching release asset for this platform")
	}
	if !isNewer(u.current, status.Latest) {
		return status, errors.New("already up to date")
	}

	exe, err := os.Executable()
	if err != nil {
		return status, err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	dir := filepath.Dir(exe)

	checksums, _ := u.downloadText(ctx, checksumsURL(u.repo, status.Latest))

	tmp, err := os.CreateTemp(dir, ".redisui-update-*")
	if err != nil {
		return status, fmt.Errorf("cannot write next to binary (%s): %w", dir, err)
	}
	tmpPath := tmp.Name()
	defer func() { _ = os.Remove(tmpPath) }()

	sum, err := u.downloadAsset(ctx, status.AssetURL, tmp)
	_ = tmp.Close()
	if err != nil {
		return status, err
	}
	if checksums != "" {
		want := lookupChecksum(checksums, assetFileName())
		if want != "" && !strings.EqualFold(want, sum) {
			return status, fmt.Errorf("checksum mismatch: got %s want %s", sum, want)
		}
	}
	if err := os.Chmod(tmpPath, 0o755); err != nil {
		return status, err
	}

	// Swap the binary in place.
	backup := exe + ".old"
	_ = os.Remove(backup)
	_ = os.Rename(exe, backup)
	if err := os.Rename(tmpPath, exe); err != nil {
		_ = os.Rename(backup, exe) // roll back
		return status, fmt.Errorf("replace binary: %w", err)
	}
	u.logf("updated to %s, restarting…", status.Latest)

	if u.restart != nil {
		if err := u.restart(); err != nil {
			return status, fmt.Errorf("restart: %w", err)
		}
	}
	return status, nil
}

func (u *Updater) downloadText(ctx context.Context, url string) (string, error) {
	if url == "" {
		return "", nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := u.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download %s: %s", url, resp.Status)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return string(b), err
}

// downloadAsset streams the release tarball and writes the redisui binary from
// it into dst, returning the sha256 of the tarball.
func (u *Updater) downloadAsset(ctx context.Context, url string, dst *os.File) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := u.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download asset: %s", resp.Status)
	}

	// Tee to hash while buffering to a temp file, then extract.
	spool, err := os.CreateTemp("", "redisui-dl-*")
	if err != nil {
		return "", err
	}
	defer func() { _ = os.Remove(spool.Name()); _ = spool.Close() }()

	hasher := sha256.New()
	if _, err := io.Copy(io.MultiWriter(spool, hasher), resp.Body); err != nil {
		return "", err
	}
	sum := hex.EncodeToString(hasher.Sum(nil))

	if _, err := spool.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	gz, err := gzip.NewReader(spool)
	if err != nil {
		return "", err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		if filepath.Base(hdr.Name) != "redisui" {
			continue
		}
		if _, err := io.Copy(dst, io.LimitReader(tr, 1<<30)); err != nil {
			return "", err
		}
		return sum, nil
	}
	return "", errors.New("redisui binary not found in release archive")
}

func (u *Updater) recordError(err error) {
	u.setStatus(func(s *Status) {
		s.CheckedAt = time.Now()
		s.LastError = err.Error()
	})
}

// assetFileName is the release asset name for this platform.
func assetFileName() string {
	return fmt.Sprintf("redisui_%s_%s.tar.gz", runtime.GOOS, runtime.GOARCH)
}

func checksumsURL(repo, tag string) string {
	return fmt.Sprintf("https://github.com/%s/releases/download/%s/checksums.txt", repo, tag)
}

func lookupChecksum(checksums, name string) string {
	for _, line := range strings.Split(checksums, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && strings.TrimPrefix(fields[1], "*") == name {
			return fields[0]
		}
	}
	return ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// isNewer reports whether latest is a strictly newer semver than current.
func isNewer(current, latest string) bool {
	cur, ok1 := parseSemver(current)
	lat, ok2 := parseSemver(latest)
	if !ok2 {
		return false
	}
	if !ok1 {
		return true
	}
	for i := 0; i < 3; i++ {
		if lat[i] != cur[i] {
			return lat[i] > cur[i]
		}
	}
	return false
}

func parseSemver(v string) ([3]int, bool) {
	v = strings.TrimSpace(strings.TrimPrefix(v, "v"))
	if v == "" {
		return [3]int{}, false
	}
	v = strings.SplitN(v, "-", 2)[0] // drop pre-release
	v = strings.SplitN(v, "+", 2)[0] // drop build metadata
	parts := strings.Split(v, ".")
	if len(parts) == 0 || len(parts) > 3 {
		return [3]int{}, false
	}
	var out [3]int
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil {
			return [3]int{}, false
		}
		out[i] = n
	}
	return out, true
}
