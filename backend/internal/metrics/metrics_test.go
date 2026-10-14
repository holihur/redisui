package metrics

import (
	"strings"
	"testing"
)

func TestRender(t *testing.T) {
	m := New()
	m.Observe("GET", 200)
	m.Observe("GET", 200)
	m.Observe("POST", 201)
	m.AuthFailure()

	out := m.Render(map[string]float64{"redisui_sessions_active": 3})
	for _, want := range []string{
		"redisui_uptime_seconds",
		`redisui_http_requests_total{method="GET",status="200"} 2`,
		`redisui_http_requests_total{method="POST",status="201"} 1`,
		"redisui_auth_failures_total 1",
		"redisui_sessions_active 3",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("render missing %q\n%s", want, out)
		}
	}
}
