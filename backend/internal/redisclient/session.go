package redisclient

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"redisui/internal/model"
	"redisui/internal/tunnel"
)

// Session wraps one logical Redis connection. It lazily creates one
// go-redis client per logical database index, all sharing the same SSH
// tunnel (when configured).
type Session struct {
	ID        string
	ConnID    string
	Name      string
	info      model.Connection
	dialer    *tunnel.Tunnel
	CreatedAt time.Time

	mu      sync.Mutex
	clients map[int]*redis.Client
	closed  bool
}

// Connect validates the profile and returns a live session.
func Connect(ctx context.Context, id string, info model.Connection) (*Session, error) {
	info.ApplyDefaults()
	s := &Session{
		ID:        id,
		ConnID:    info.ID,
		Name:      info.Name,
		info:      info,
		clients:   map[int]*redis.Client{},
		CreatedAt: time.Now().UTC(),
	}
	if info.SSH != nil && info.SSH.Enabled {
		t, err := tunnel.New(*info.SSH)
		if err != nil {
			return nil, err
		}
		s.dialer = t
	}
	if err := s.client(info.DB).Ping(ctx).Err(); err != nil {
		_ = s.Close()
		return nil, fmt.Errorf("redis ping failed: %w", err)
	}
	return s, nil
}

// TestConnection validates a profile without registering a session.
func TestConnection(ctx context.Context, info model.Connection) error {
	s, err := Connect(ctx, "test", info)
	if err != nil {
		return err
	}
	return s.Close()
}

func (s *Session) client(db int) *redis.Client {
	s.mu.Lock()
	defer s.mu.Unlock()
	if c, ok := s.clients[db]; ok {
		return c
	}
	opts := &redis.Options{
		Addr:         net.JoinHostPort(s.info.Host, strconv.Itoa(s.info.Port)),
		Username:     s.info.Username,
		Password:     s.info.Password,
		DB:           db,
		DialTimeout:  10 * time.Second,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		PoolSize:     10,
	}
	if s.info.TLS {
		opts.TLSConfig = &tls.Config{
			InsecureSkipVerify: !s.info.TLSVerify,
			ServerName:         s.info.Host,
		}
	}
	if s.dialer != nil {
		opts.Dialer = s.dialer.Dial
	}
	c := redis.NewClient(opts)
	s.clients[db] = c
	return c
}

func (s *Session) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true
	for _, c := range s.clients {
		_ = c.Close()
	}
	s.clients = map[int]*redis.Client{}
	if s.dialer != nil {
		return s.dialer.Close()
	}
	return nil
}

func (s *Session) Info() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return map[string]any{
		"id":        s.ID,
		"connId":    s.ConnID,
		"name":      s.Name,
		"host":      s.info.Host,
		"port":      s.info.Port,
		"db":        s.info.DB,
		"tls":       s.info.TLS,
		"ssh":       s.dialer != nil,
		"createdAt": s.CreatedAt,
	}
}

// ---------------------------------------------------------------------------
// Databases & server info
// ---------------------------------------------------------------------------

type DatabaseInfo struct {
	Index   int   `json:"index"`
	Keys    int64 `json:"keys"`
	Expires int64 `json:"expires"`
	Used    bool  `json:"used"`
}

// Databases returns the list of logical databases and their key counts.
func (s *Session) Databases(ctx context.Context, db int) ([]DatabaseInfo, error) {
	cli := s.client(db)

	count := int64(16)
	if res, err := cli.ConfigGet(ctx, "databases").Result(); err == nil {
		if v, ok := res["databases"]; ok {
			if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
				count = n
			}
		}
	} else {
		// CONFIG may be disabled; fall back to keyspace info.
		if info, err := cli.Info(ctx, "keyspace").Result(); err == nil {
			count = maxInt64(count, highestDB(info)+1)
		}
	}

	used := map[int][2]int64{}
	if info, err := cli.Info(ctx, "keyspace").Result(); err == nil {
		for _, line := range strings.Split(info, "\n") {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "db") {
				continue
			}
			name, rest, ok := strings.Cut(line, ":")
			if !ok {
				continue
			}
			idx, err := strconv.Atoi(strings.TrimPrefix(name, "db"))
			if err != nil {
				continue
			}
			var keys, expires int64
			for _, kv := range strings.Split(rest, ",") {
				k, v, ok := strings.Cut(strings.TrimSpace(kv), "=")
				if !ok {
					continue
				}
				n, _ := strconv.ParseInt(v, 10, 64)
				switch k {
				case "keys":
					keys = n
				case "expires":
					expires = n
				}
			}
			used[idx] = [2]int64{keys, expires}
			count = maxInt64(count, int64(idx)+1)
		}
	}

	out := make([]DatabaseInfo, 0, count)
	for i := 0; i < int(count); i++ {
		di := DatabaseInfo{Index: i}
		if v, ok := used[i]; ok {
			di.Keys, di.Expires, di.Used = v[0], v[1], true
		}
		out = append(out, di)
	}
	return out, nil
}

type ServerInfo struct {
	Server   map[string]string `json:"server"`
	Clients  map[string]string `json:"clients"`
	Memory   map[string]string `json:"memory"`
	Keyspace map[string]string `json:"keyspace"`
	Stats    map[string]string `json:"stats"`
	Replication map[string]string `json:"replication"`
}

// ServerInfo returns a curated view of the INFO command.
func (s *Session) ServerInfo(ctx context.Context, db int) (*ServerInfo, error) {
	raw, err := s.client(db).Info(ctx).Result()
	if err != nil {
		return nil, err
	}
	sections := parseInfo(raw)
	return &ServerInfo{
		Server:      sections["server"],
		Clients:     sections["clients"],
		Memory:      sections["memory"],
		Keyspace:    sections["keyspace"],
		Stats:       sections["stats"],
		Replication: sections["replication"],
	}, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func parseInfo(raw string) map[string]map[string]string {
	out := map[string]map[string]string{}
	var section string
	for _, line := range strings.Split(raw, "\r\n") {
		line = strings.TrimRight(line, "\r")
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "#") {
			section = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(line, "#")))
			if _, ok := out[section]; !ok {
				out[section] = map[string]string{}
			}
			continue
		}
		if section == "" {
			continue
		}
		k, v, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		out[section][k] = v
	}
	return out
}

func highestDB(info string) int64 {
	var max int64 = -1
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "db") {
			continue
		}
		name, _, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		idx, err := strconv.ParseInt(strings.TrimPrefix(name, "db"), 10, 64)
		if err == nil && idx > max {
			max = idx
		}
	}
	return max
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// SplitCommand parses a raw command line the way redis-cli does (basic
// single/double quote handling).
func SplitCommand(line string) ([]string, error) {
	var args []string
	var cur strings.Builder
	var quote rune
	inToken := false
	runes := []rune(line)
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		switch {
		case quote != 0:
			if r == '\\' && i+1 < len(runes) {
				i++
				cur.WriteRune(unescape(runes[i]))
				continue
			}
			if r == quote {
				quote = 0
				continue
			}
			cur.WriteRune(r)
		case r == '\'' || r == '"':
			quote = r
			inToken = true
		case r == ' ' || r == '\t':
			if inToken {
				args = append(args, cur.String())
				cur.Reset()
				inToken = false
			}
		default:
			inToken = true
			cur.WriteRune(r)
		}
	}
	if quote != 0 {
		return nil, fmt.Errorf("unterminated quote")
	}
	if inToken {
		args = append(args, cur.String())
	}
	if len(args) == 0 {
		return nil, fmt.Errorf("empty command")
	}
	return args, nil
}

func unescape(r rune) rune {
	switch r {
	case 'n':
		return '\n'
	case 'r':
		return '\r'
	case 't':
		return '\t'
	default:
		return r
	}
}

func sortStrings(list []string) { sort.Strings(list) }
