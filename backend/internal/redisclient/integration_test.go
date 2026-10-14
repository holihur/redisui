package redisclient

import (
	"context"
	"fmt"
	"net"
	"os"
	"strconv"
	"testing"
	"time"

	"redisui/internal/model"
)

// TestIntegration exercises a real Redis server. It is skipped unless
// REDISUI_TEST_REDIS_ADDR (host:port) is set, e.g. in CI with a redis service.
func TestIntegration(t *testing.T) {
	addr := os.Getenv("REDISUI_TEST_REDIS_ADDR")
	if addr == "" {
		t.Skip("set REDISUI_TEST_REDIS_ADDR to run integration tests")
	}
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		host, portStr = addr, "6379"
	}
	port, _ := strconv.Atoi(portStr)
	if port == 0 {
		port = 6379
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	sess, err := Connect(ctx, "it", model.Connection{ID: "it", Name: "it", Host: host, Port: port})
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer sess.Close()

	const key = "redisui:integration:key"
	defer func() { _, _ = sess.Delete(context.Background(), 0, key) }()

	// Write through the mutation API.
	if _, err := sess.Apply(ctx, Mutation{DB: 0, Key: key, Action: "string.set", Value: "v1"}); err != nil {
		t.Fatalf("Apply set: %v", err)
	}

	// Read it back with full detail.
	detail, err := sess.GetKey(ctx, 0, key, 0, 10, "")
	if err != nil {
		t.Fatalf("GetKey: %v", err)
	}
	if detail.Type != "string" || detail.Value != "v1" {
		t.Fatalf("unexpected detail: %+v", detail)
	}

	// Discover it via SCAN. A single SCAN page can be empty even when the key
	// exists, so iterate until the cursor wraps around.
	var (
		cursor uint64
		found  bool
	)
	for i := 0; i < 50 && !found; i++ {
		keys, next, err := sess.ScanKeys(ctx, 0, cursor, "redisui:integration:*", 100, "all", true)
		if err != nil {
			t.Fatalf("ScanKeys: %v", err)
		}
		for _, k := range keys {
			if k.Key == key {
				found = true
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	if !found {
		t.Fatalf("key %q not found by scanning", key)
	}

	// Databases should report the keyspace.
	dbs, err := sess.Databases(ctx, 0)
	if err != nil {
		t.Fatalf("Databases: %v", err)
	}
	if len(dbs) == 0 || !dbs[0].Used {
		t.Fatalf("expected db0 to be in use: %+v", dbs)
	}
}

// TestIntegrationScripts exercises EVAL / SCRIPT LOAD / EVALSHA against a real
// Redis. Skipped unless REDISUI_TEST_REDIS_ADDR is set.
func TestIntegrationScripts(t *testing.T) {
	addr := os.Getenv("REDISUI_TEST_REDIS_ADDR")
	if addr == "" {
		t.Skip("set REDISUI_TEST_REDIS_ADDR to run integration tests")
	}
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		host, portStr = addr, "6379"
	}
	port, _ := strconv.Atoi(portStr)
	if port == 0 {
		port = 6379
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	sess, err := Connect(ctx, "it-scripts", model.Connection{ID: "it-scripts", Name: "it", Host: host, Port: port})
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer sess.Close()

	res, err := sess.Eval(ctx, 0, "return 1", nil, nil)
	if err != nil {
		t.Fatalf("Eval: %v", err)
	}
	if fmt.Sprintf("%v", res) != "1" {
		t.Fatalf("Eval result = %v", res)
	}

	sha, err := sess.ScriptLoad(ctx, 0, "return ARGV[1]")
	if err != nil {
		t.Fatalf("ScriptLoad: %v", err)
	}
	if len(sha) != 40 {
		t.Fatalf("sha = %q", sha)
	}
	res, err = sess.EvalSHA(ctx, 0, sha, nil, []string{"hello"})
	if err != nil {
		t.Fatalf("EvalSHA: %v", err)
	}
	if fmt.Sprintf("%v", res) != "hello" {
		t.Fatalf("EvalSHA result = %v", res)
	}

	if _, err := sess.EvalSHA(ctx, 0, "0000000000000000000000000000000000000000", nil, nil); err == nil {
		t.Fatal("expected NOSCRIPT for an unknown sha")
	}
}
