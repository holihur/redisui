package redisclient

import (
	"context"
	"net"
	"os"
	"strconv"
	"testing"
	"time"

	"redisui/internal/model"
)

// TestIntegrationRediSearch exercises index administration against a real
// module. Skipped unless REDISUI_TEST_SEARCH_ADDR (host:port) is set.
func TestIntegrationRediSearch(t *testing.T) {
	addr := os.Getenv("REDISUI_TEST_SEARCH_ADDR")
	if addr == "" {
		t.Skip("set REDISUI_TEST_SEARCH_ADDR to run RediSearch integration tests")
	}
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		host, portStr = addr, "6379"
	}
	port, _ := strconv.Atoi(portStr)
	if port == 0 {
		port = 6379
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	sess, err := Connect(ctx, "it-search", model.Connection{ID: "it-search", Name: "it", Host: host, Port: port})
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer sess.Close()

	const index = "redisui_it_idx"
	_ = sess.DropIndex(ctx, 0, index, true) // best-effort cleanup

	if err := sess.CreateIndex(ctx, 0, IndexSpec{
		Index:    index,
		On:       "HASH",
		Prefixes: []string{"redisui:it:"},
		Fields: []SchemaField{
			{Name: "title", Type: "TEXT", Options: []string{"SORTABLE"}},
			{Name: "price", Type: "NUMERIC"},
		},
	}); err != nil {
		t.Fatalf("CreateIndex: %v", err)
	}

	info, err := sess.IndexInfo(ctx, 0, index)
	if err != nil {
		t.Fatalf("IndexInfo: %v", err)
	}
	if info.Name != index {
		t.Fatalf("index name = %q, want %q", info.Name, index)
	}
	if len(info.Fields) != 2 {
		t.Fatalf("expected 2 fields, got %+v", info.Fields)
	}

	if err := sess.DropIndex(ctx, 0, index, true); err != nil {
		t.Fatalf("DropIndex: %v", err)
	}
}
