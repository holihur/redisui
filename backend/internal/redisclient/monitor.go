package redisclient

import (
	"bufio"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"redisui/internal/model"
)

// MonitorStream yields one MONITOR line at a time over a dedicated connection.
type MonitorStream struct {
	conn net.Conn
	r    *bufio.Reader
}

// Next blocks until the next command line is received.
func (m *MonitorStream) Next() (string, error) {
	for {
		line, err := m.r.ReadString('\n')
		if err != nil {
			return "", err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			continue
		}
		switch line[0] {
		case '+':
			return line[1:], nil
		case '-':
			return "", errors.New(line[1:])
		default:
			return line, nil
		}
	}
}

func (m *MonitorStream) Close() error { return m.conn.Close() }

// Monitor opens a dedicated connection and starts the MONITOR stream. The
// caller must Close the returned stream.
func (s *Session) Monitor(ctx context.Context, db int) (*MonitorStream, error) {
	conn, err := s.dialRaw(ctx)
	if err != nil {
		return nil, err
	}
	if s.info.Password != "" {
		if err := writeCommand(conn, "AUTH", s.info.Username, s.info.Password); err != nil {
			_ = conn.Close()
			return nil, err
		}
		if _, err := readSimple(conn); err != nil {
			_ = conn.Close()
			return nil, err
		}
	}
	if db != 0 {
		if err := writeCommand(conn, "SELECT", strconv.Itoa(db)); err != nil {
			_ = conn.Close()
			return nil, err
		}
		if _, err := readSimple(conn); err != nil {
			_ = conn.Close()
			return nil, err
		}
	}
	if err := writeCommand(conn, "MONITOR"); err != nil {
		_ = conn.Close()
		return nil, err
	}
	if reply, err := readSimple(conn); err != nil || reply != "OK" {
		_ = conn.Close()
		return nil, fmt.Errorf("monitor refused: %v (%s)", err, reply)
	}
	return &MonitorStream{conn: conn, r: bufio.NewReader(conn)}, nil
}

// dialRaw opens a raw connection using the session's tunnel/TLS settings.
func (s *Session) dialRaw(ctx context.Context) (net.Conn, error) {
	addr := s.rawAddr(ctx)
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	var (
		conn net.Conn
		err  error
	)
	if s.dialer != nil {
		conn, err = s.dialer.Dial(ctx, "tcp", addr)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return nil, err
	}
	if s.info.TLS {
		tc := tls.Client(conn, s.tlsConfig())
		if err := tc.HandshakeContext(ctx); err != nil {
			_ = conn.Close()
			return nil, err
		}
		conn = tc
	}
	return conn, nil
}

// rawAddr resolves the concrete host:port to dial for MONITOR.
func (s *Session) rawAddr(ctx context.Context) string {
	switch s.info.EffectiveMode() {
	case model.ModeCluster:
		if len(s.info.ClusterAddrs) > 0 {
			return s.info.ClusterAddrs[0]
		}
	case model.ModeSentinel:
		if addr := s.resolveSentinelMaster(ctx); addr != "" {
			return addr
		}
	}
	return net.JoinHostPort(s.info.Host, strconv.Itoa(s.info.Port))
}

func (s *Session) resolveSentinelMaster(ctx context.Context) string {
	if len(s.info.Sentinels) == 0 {
		return ""
	}
	opts := &redis.Options{
		Addr:         s.info.Sentinels[0],
		Username:     s.info.SentinelUsername,
		Password:     s.info.SentinelPassword,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
	}
	if s.dialer != nil {
		opts.Dialer = s.dialer.Dial
	}
	if s.info.TLS {
		opts.TLSConfig = &tls.Config{InsecureSkipVerify: true}
	}
	cli := redis.NewClient(opts)
	defer cli.Close()
	res, err := cli.Do(ctx, "SENTINEL", "get-master-addr-by-name", s.info.MasterName).Result()
	if err != nil {
		return ""
	}
	arr, ok := res.([]any)
	if !ok || len(arr) < 2 {
		return ""
	}
	return net.JoinHostPort(fmt.Sprintf("%v", arr[0]), fmt.Sprintf("%v", arr[1]))
}

func writeCommand(w io.Writer, args ...string) error {
	var b strings.Builder
	fmt.Fprintf(&b, "*%d\r\n", len(args))
	for _, a := range args {
		fmt.Fprintf(&b, "$%d\r\n%s\r\n", len(a), a)
	}
	_, err := io.WriteString(w, b.String())
	return err
}

func readSimple(conn net.Conn) (string, error) {
	r := bufio.NewReader(conn)
	line, err := r.ReadString('\n')
	if err != nil {
		return "", err
	}
	line = strings.TrimRight(line, "\r\n")
	if line == "" {
		return "", nil
	}
	switch line[0] {
	case '+':
		return line[1:], nil
	case '-':
		return "", errors.New(line[1:])
	default:
		return line, nil
	}
}
