// Package metrics exposes lightweight Prometheus-style counters.
package metrics

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

type Metrics struct {
	start time.Time

	mu       sync.Mutex
	requests map[string]int64
	authFail int64
}

func New() *Metrics {
	return &Metrics{start: time.Now(), requests: map[string]int64{}}
}

// Observe records one HTTP request.
func (m *Metrics) Observe(method string, status int) {
	m.mu.Lock()
	m.requests[fmt.Sprintf("%s|%d", method, status)]++
	m.mu.Unlock()
}

// AuthFailure records a failed authentication attempt.
func (m *Metrics) AuthFailure() {
	m.mu.Lock()
	m.authFail++
	m.mu.Unlock()
}

// Render produces the Prometheus text exposition format.
func (m *Metrics) Render(gauges map[string]float64) string {
	m.mu.Lock()
	reqs := make(map[string]int64, len(m.requests))
	for k, v := range m.requests {
		reqs[k] = v
	}
	authFail := m.authFail
	m.mu.Unlock()

	var b strings.Builder
	b.WriteString("# HELP redisui_uptime_seconds Seconds since start.\n")
	b.WriteString("# TYPE redisui_uptime_seconds gauge\n")
	fmt.Fprintf(&b, "redisui_uptime_seconds %.0f\n", time.Since(m.start).Seconds())

	b.WriteString("# HELP redisui_http_requests_total HTTP requests by method and status.\n")
	b.WriteString("# TYPE redisui_http_requests_total counter\n")
	keys := make([]string, 0, len(reqs))
	for k := range reqs {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		parts := strings.SplitN(k, "|", 2)
		fmt.Fprintf(&b, "redisui_http_requests_total{method=%q,status=%q} %d\n", parts[0], parts[1], reqs[k])
	}

	b.WriteString("# HELP redisui_auth_failures_total Failed authentication attempts.\n")
	b.WriteString("# TYPE redisui_auth_failures_total counter\n")
	fmt.Fprintf(&b, "redisui_auth_failures_total %d\n", authFail)

	gkeys := make([]string, 0, len(gauges))
	for k := range gauges {
		gkeys = append(gkeys, k)
	}
	sort.Strings(gkeys)
	for _, k := range gkeys {
		fmt.Fprintf(&b, "# TYPE %s gauge\n%s %g\n", k, k, gauges[k])
	}
	return b.String()
}
