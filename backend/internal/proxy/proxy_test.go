package proxy

import (
	"context"
	"net"
	"strings"
	"testing"
	"time"
)

func TestProxyForwardsAndCounts(t *testing.T) {
	// Fake upstream: reply +OK to any request.
	up, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen upstream: %v", err)
	}
	defer up.Close()
	go func() {
		for {
			c, err := up.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				buf := make([]byte, 1024)
				for {
					n, err := c.Read(buf)
					if n > 0 {
						_, _ = c.Write([]byte("+OK\r\n"))
					}
					if err != nil {
						return
					}
				}
			}(c)
		}
	}()

	p := New("127.0.0.1:0", up.Addr().String())
	if err := p.Start(context.Background()); err != nil {
		t.Fatalf("proxy start: %v", err)
	}
	addr := p.Snapshot().Addr
	if addr == "" || strings.HasSuffix(addr, ":0") {
		t.Fatalf("proxy did not bind: %q", addr)
	}

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatalf("dial proxy: %v", err)
	}
	if _, err := conn.Write([]byte("*1\r\n$4\r\nPING\r\n")); err != nil {
		t.Fatalf("write: %v", err)
	}
	reply := make([]byte, 16)
	n, err := conn.Read(reply)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !strings.HasPrefix(string(reply[:n]), "+OK") {
		t.Fatalf("unexpected reply: %q", reply[:n])
	}
	_ = conn.Close()

	// Give the proxy a moment to observe the close.
	deadline := time.Now().Add(2 * time.Second)
	var snap Snapshot
	for time.Now().Before(deadline) {
		snap = p.Snapshot()
		if snap.Up > 0 && snap.Down > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if snap.Up == 0 || snap.Down == 0 {
		t.Fatalf("counters not recorded: %+v", snap)
	}
	if snap.Commands != 1 {
		t.Fatalf("commands = %d, want 1", snap.Commands)
	}
	if snap.Total == 0 {
		t.Fatalf("total connections = 0")
	}
}
