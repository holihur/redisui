// Package proxy implements a transparent Redis protocol (RESP) TCP proxy that
// records uplink/downlink bytes and command counts per client connection.
package proxy

import (
	"context"
	"net"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

const seriesWindow = 180

// Bucket is one second of throughput.
type Bucket struct {
	T    int64 `json:"t"`
	Up   int64 `json:"up"`
	Down int64 `json:"down"`
}

// ConnStats describes one live proxied connection.
type ConnStats struct {
	ID          uint64 `json:"id"`
	Remote      string `json:"remote"`
	StartedAt   int64  `json:"startedAt"`
	Up          int64  `json:"up"`
	Down        int64  `json:"down"`
	Commands    int64  `json:"commands"`
	LastCommand string `json:"lastCommand"`
}

// Snapshot is the proxy's current state, safe to expose to clients.
type Snapshot struct {
	Running  bool        `json:"running"`
	Addr     string      `json:"addr"`
	Target   string      `json:"target"`
	Active   int         `json:"active"`
	Total    int64       `json:"total"`
	Up       int64       `json:"up"`
	Down     int64       `json:"down"`
	Commands int64       `json:"commands"`
	Conns    []ConnStats `json:"conns"`
	Series   []Bucket    `json:"series"`
}

type conn struct {
	id        uint64
	remote    string
	startedAt time.Time
	up        atomic.Int64
	down      atomic.Int64
	commands  atomic.Int64
	last      atomic.Value // string
}

// Proxy forwards RESP traffic to a single Redis target.
type Proxy struct {
	addr   string
	target string

	mu      sync.Mutex
	ln      net.Listener
	bound   string
	conns   map[uint64]*conn
	nextID  uint64
	total   int64
	buckets []Bucket

	up       atomic.Int64
	down     atomic.Int64
	commands atomic.Int64
}

func New(addr, target string) *Proxy {
	return &Proxy{addr: addr, target: target, conns: map[uint64]*conn{}}
}

// Start begins listening. It returns once the listener is bound.
func (p *Proxy) Start(ctx context.Context) error {
	ln, err := net.Listen("tcp", p.addr)
	if err != nil {
		return err
	}
	p.mu.Lock()
	p.ln = ln
	p.bound = ln.Addr().String()
	p.mu.Unlock()
	go func() {
		<-ctx.Done()
		_ = ln.Close()
	}()
	go p.acceptLoop(ln)
	return nil
}

func (p *Proxy) acceptLoop(ln net.Listener) {
	for {
		client, err := ln.Accept()
		if err != nil {
			return
		}
		go p.handle(client)
	}
}

func (p *Proxy) handle(client net.Conn) {
	defer client.Close()
	upstream, err := net.DialTimeout("tcp", p.target, 10*time.Second)
	if err != nil {
		return
	}
	defer upstream.Close()

	c := p.open(client.RemoteAddr().String())
	defer p.close(c)

	done := make(chan struct{}, 2)

	// Uplink: client -> Redis (requests), parsed for command names.
	go func() {
		parser := &respParser{}
		buf := make([]byte, 32*1024)
		for {
			n, err := client.Read(buf)
			if n > 0 {
				p.addUp(c, int64(n))
				if names := parser.Feed(buf[:n]); len(names) > 0 {
					c.commands.Add(int64(len(names)))
					p.commands.Add(int64(len(names)))
					c.last.Store(names[len(names)-1])
				}
				if _, werr := upstream.Write(buf[:n]); werr != nil {
					break
				}
			}
			if err != nil {
				break
			}
		}
		done <- struct{}{}
	}()

	// Downlink: Redis -> client (responses).
	go func() {
		buf := make([]byte, 32*1024)
		for {
			n, err := upstream.Read(buf)
			if n > 0 {
				p.addDown(c, int64(n))
				if _, werr := client.Write(buf[:n]); werr != nil {
					break
				}
			}
			if err != nil {
				break
			}
		}
		done <- struct{}{}
	}()

	<-done
}

func (p *Proxy) open(remote string) *conn {
	p.mu.Lock()
	p.nextID++
	c := &conn{id: p.nextID, remote: remote, startedAt: time.Now()}
	c.last.Store("")
	p.conns[c.id] = c
	p.total++
	p.mu.Unlock()
	return c
}

func (p *Proxy) close(c *conn) {
	p.mu.Lock()
	delete(p.conns, c.id)
	p.mu.Unlock()
}

func (p *Proxy) addUp(c *conn, n int64) {
	c.up.Add(n)
	p.up.Add(n)
	p.bump(n, 0)
}

func (p *Proxy) addDown(c *conn, n int64) {
	c.down.Add(n)
	p.down.Add(n)
	p.bump(0, n)
}

func (p *Proxy) bump(up, down int64) {
	sec := time.Now().Unix()
	p.mu.Lock()
	if len(p.buckets) == 0 {
		p.buckets = append(p.buckets, Bucket{T: sec})
	} else if last := p.buckets[len(p.buckets)-1].T; last != sec {
		for t := last + 1; t <= sec; t++ {
			p.buckets = append(p.buckets, Bucket{T: t})
		}
	}
	b := &p.buckets[len(p.buckets)-1]
	b.Up += up
	b.Down += down
	if len(p.buckets) > seriesWindow {
		p.buckets = p.buckets[len(p.buckets)-seriesWindow:]
	}
	p.mu.Unlock()
}

// Snapshot returns the current metrics.
func (p *Proxy) Snapshot() Snapshot {
	p.mu.Lock()
	conns := make([]ConnStats, 0, len(p.conns))
	for _, c := range p.conns {
		last, _ := c.last.Load().(string)
		conns = append(conns, ConnStats{
			ID:          c.id,
			Remote:      c.remote,
			StartedAt:   c.startedAt.Unix(),
			Up:          c.up.Load(),
			Down:        c.down.Load(),
			Commands:    c.commands.Load(),
			LastCommand: last,
		})
	}
	series := make([]Bucket, len(p.buckets))
	copy(series, p.buckets)
	total := p.total
	addr := p.bound
	if addr == "" {
		addr = p.addr
	}
	p.mu.Unlock()

	sort.Slice(conns, func(i, j int) bool { return conns[i].ID < conns[j].ID })
	return Snapshot{
		Running:  true,
		Addr:     addr,
		Target:   p.target,
		Active:   len(conns),
		Total:    total,
		Up:       p.up.Load(),
		Down:     p.down.Load(),
		Commands: p.commands.Load(),
		Conns:    conns,
		Series:   series,
	}
}
