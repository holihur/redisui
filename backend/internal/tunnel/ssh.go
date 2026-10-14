package tunnel

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"

	"redisui/internal/model"
)

// Tunnel is a live SSH connection used as a jump host for TCP dialing.
type Tunnel struct {
	client *ssh.Client
	addr   string

	mu     sync.Mutex
	closed bool
	stop   chan struct{}
}

// New establishes the SSH connection described by cfg.
func New(cfg model.SSHConfig) (*Tunnel, error) {
	if !cfg.Enabled {
		return nil, errors.New("ssh tunnel disabled")
	}
	if cfg.Host == "" {
		return nil, errors.New("ssh host is required")
	}
	if cfg.Port == 0 {
		cfg.Port = 22
	}
	if cfg.User == "" {
		return nil, errors.New("ssh user is required")
	}

	auths, err := authMethods(cfg)
	if err != nil {
		return nil, err
	}
	if len(auths) == 0 {
		return nil, errors.New("no usable ssh auth method configured")
	}

	hostKeyCallback, err := hostKeyCallback(cfg.HostKeyFingerprint)
	if err != nil {
		return nil, err
	}

	clientCfg := &ssh.ClientConfig{
		User:            cfg.User,
		Auth:            auths,
		HostKeyCallback: hostKeyCallback,
		Timeout:         15 * time.Second,
	}

	addr := net.JoinHostPort(cfg.Host, fmt.Sprintf("%d", cfg.Port))
	client, err := ssh.Dial("tcp", addr, clientCfg)
	if err != nil {
		return nil, fmt.Errorf("ssh dial %s: %w", addr, err)
	}

	t := &Tunnel{client: client, addr: addr, stop: make(chan struct{})}
	go t.keepAlive()
	return t, nil
}

// Dial opens a TCP connection to target through the SSH tunnel.
// It satisfies the go-redis custom dialer signature.
func (t *Tunnel) Dial(ctx context.Context, network, addr string) (net.Conn, error) {
	type result struct {
		conn net.Conn
		err  error
	}
	ch := make(chan result, 1)
	go func() {
		c, err := t.client.Dial(network, addr)
		ch <- result{c, err}
	}()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case r := <-ch:
		return r.conn, r.err
	}
}

func (t *Tunnel) Addr() string { return t.addr }

func (t *Tunnel) Close() error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.closed {
		return nil
	}
	t.closed = true
	close(t.stop)
	return t.client.Close()
}

func (t *Tunnel) keepAlive() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-t.stop:
			return
		case <-ticker.C:
			_, _, err := t.client.SendRequest("keepalive@openssh.com", true, nil)
			if err != nil {
				return
			}
		}
	}
}

// TestConnect opens and immediately closes an SSH connection to validate cfg.
func TestConnect(cfg model.SSHConfig) error {
	t, err := New(cfg)
	if err != nil {
		return err
	}
	return t.Close()
}

func authMethods(cfg model.SSHConfig) ([]ssh.AuthMethod, error) {
	var auths []ssh.AuthMethod
	switch cfg.AuthMethod {
	case model.SSHAuthKey:
		key, err := parseKey(cfg.PrivateKey, cfg.Passphrase)
		if err != nil {
			return nil, err
		}
		auths = append(auths, ssh.PublicKeys(key))
	case model.SSHAuthPassword:
		fallthrough
	default:
		if cfg.Password != "" {
			auths = append(auths, ssh.Password(cfg.Password))
			auths = append(auths, ssh.KeyboardInteractive(func(_, _ string, questions []string, _ []bool) ([]string, error) {
				answers := make([]string, len(questions))
				for i := range answers {
					answers[i] = cfg.Password
				}
				return answers, nil
			}))
		}
	}
	return auths, nil
}

func parseKey(keyData, passphrase string) (ssh.Signer, error) {
	if keyData == "" {
		return nil, errors.New("ssh private key is required")
	}
	// Allow passing a path to a key file instead of the key material.
	if !strings.Contains(keyData, "PRIVATE KEY") {
		if info, err := os.Stat(keyData); err == nil && !info.IsDir() {
			data, err := os.ReadFile(keyData)
			if err != nil {
				return nil, fmt.Errorf("read ssh key %s: %w", keyData, err)
			}
			keyData = string(data)
		}
	}
	if passphrase != "" {
		signer, err := ssh.ParsePrivateKeyWithPassphrase([]byte(keyData), []byte(passphrase))
		if err != nil {
			return nil, fmt.Errorf("parse encrypted ssh key: %w", err)
		}
		return signer, nil
	}
	signer, err := ssh.ParsePrivateKey([]byte(keyData))
	if err != nil {
		return nil, fmt.Errorf("parse ssh key (encrypted key requires a passphrase): %w", err)
	}
	return signer, nil
}

func hostKeyCallback(pinned string) (ssh.HostKeyCallback, error) {
	if pinned == "" {
		// The user did not pin a fingerprint: accept any key, like most
		// database GUI clients do for the "first connect" flow.
		return ssh.InsecureIgnoreHostKey(), nil
	}
	pinned = strings.TrimSpace(pinned)
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		sum := sha256.Sum256(key.Marshal())
		fp := "SHA256:" + base64.RawStdEncoding.EncodeToString(sum[:])
		if strings.EqualFold(fp, pinned) {
			return nil
		}
		return fmt.Errorf("ssh host key mismatch for %s: got %s, want %s", hostname, fp, pinned)
	}, nil
}
