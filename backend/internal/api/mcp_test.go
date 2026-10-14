package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"redisui/internal/model"
	"redisui/internal/secret"
	"redisui/internal/store"
)

func TestMCPInitializeAndTools(t *testing.T) {
	s := &Server{}

	post := func(body string) (int, map[string]any) {
		req := httptest.NewRequest(http.MethodPost, "/api/mcp", strings.NewReader(body))
		rec := httptest.NewRecorder()
		s.mcp(rec, req)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec.Code, out
	}

	code, out := post(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`)
	if code != http.StatusOK {
		t.Fatalf("initialize status %d", code)
	}
	result, _ := out["result"].(map[string]any)
	if result["protocolVersion"] == nil || result["serverInfo"] == nil {
		t.Fatalf("initialize result: %#v", out)
	}

	_, out = post(`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`)
	result, _ = out["result"].(map[string]any)
	tools, _ := result["tools"].([]any)
	if len(tools) < 5 {
		t.Fatalf("expected several tools, got %d", len(tools))
	}
	names := map[string]bool{}
	for _, it := range tools {
		if m, ok := it.(map[string]any); ok {
			names[m["name"].(string)] = true
		}
	}
	for _, want := range []string{"list_connections", "get_key", "set_key", "run_command"} {
		if !names[want] {
			t.Fatalf("missing tool %q", want)
		}
	}

	_, out = post(`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nope"}}`)
	if out["error"] == nil {
		t.Fatalf("unknown tool should return an error: %#v", out)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/mcp", nil)
	rec := httptest.NewRecorder()
	s.mcp(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET should be 405, got %d", rec.Code)
	}
}

func TestMCPResources(t *testing.T) {
	cipher, _ := secret.New(bytes.Repeat([]byte{1}, 32))
	st, err := store.New(filepath.Join(t.TempDir(), "c.json"), cipher)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	if _, err := st.Create(model.Connection{ID: "c1", Name: "local", Host: "127.0.0.1", Port: 6379}); err != nil {
		t.Fatalf("create: %v", err)
	}
	s := &Server{store: st}

	res := s.mcpResources(context.Background())
	if len(res) != 1 || res[0]["uri"] != "redisui://connection/c1" {
		t.Fatalf("resources = %#v", res)
	}

	out, rpcErr := s.mcpReadResource(context.Background(), json.RawMessage(`{"uri":"redisui://connection/c1"}`))
	if rpcErr != nil {
		t.Fatalf("read: %v", rpcErr)
	}
	if out == nil {
		t.Fatal("expected contents")
	}
	if _, rpcErr := s.mcpReadResource(context.Background(), json.RawMessage(`{"uri":"bad"}`)); rpcErr == nil {
		t.Fatal("bad uri should error")
	}
}

func TestMCPArgs(t *testing.T) {
	args := map[string]any{"s": "x", "n": float64(5), "j": json.Number("7")}
	if argString(args, "s") != "x" || argString(args, "missing") != "" {
		t.Fatal("argString")
	}
	if argInt(args, "n", 0) != 5 || argInt(args, "j", 0) != 7 || argInt(args, "missing", 9) != 9 {
		t.Fatal("argInt")
	}
}
