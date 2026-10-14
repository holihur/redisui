package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"redisui/internal/account"
	"redisui/internal/redisclient"
	"redisui/internal/session"
)

// This file implements a minimal Model Context Protocol (MCP) server over
// HTTP (JSON-RPC 2.0) at POST /api/mcp. Authentication uses the same bearer
// tokens as the rest of the API (access token, login session or PAT), and tool
// calls honor the caller's role and connection scope.

const mcpProtocolVersion = "2024-11-05"

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type mcpTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

func (s *Server) mcp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeErr(w, http.StatusMethodNotAllowed, errString("MCP endpoint accepts POST JSON-RPC"))
		return
	}
	var req rpcRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeMCP(w, rpcResponse{JSONRPC: "2.0", Error: &rpcError{Code: -32700, Message: "parse error"}})
		return
	}

	// Notifications have no id and expect no response body.
	isNotification := len(req.ID) == 0

	switch req.Method {
	case "initialize":
		writeMCP(w, rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: map[string]any{
			"protocolVersion": mcpProtocolVersion,
			"capabilities": map[string]any{
				"tools":     map[string]any{},
				"resources": map[string]any{},
			},
			"serverInfo": map[string]any{"name": "redisui", "version": "1"},
		}})
	case "notifications/initialized", "initialized":
		if isNotification {
			w.WriteHeader(http.StatusAccepted)
			return
		}
		writeMCP(w, rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: map[string]any{}})
	case "ping":
		writeMCP(w, rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: map[string]any{}})
	case "tools/list":
		writeMCP(w, rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: map[string]any{"tools": mcpTools()}})
	case "resources/list":
		writeMCP(w, rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: map[string]any{"resources": s.mcpResources(r.Context())}})
	case "resources/read":
		res, rpcErr := s.mcpReadResource(r.Context(), req.Params)
		if rpcErr != nil {
			writeMCP(w, rpcResponse{JSONRPC: "2.0", ID: req.ID, Error: rpcErr})
			return
		}
		writeMCP(w, rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: res})
	case "tools/call":
		result, rpcErr := s.mcpCall(r.Context(), req.Params)
		if rpcErr != nil {
			writeMCP(w, rpcResponse{JSONRPC: "2.0", ID: req.ID, Error: rpcErr})
			return
		}
		writeMCP(w, rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: result})
	default:
		writeMCP(w, rpcResponse{JSONRPC: "2.0", ID: req.ID, Error: &rpcError{Code: -32601, Message: "method not found: " + req.Method}})
	}
}

func writeMCP(w http.ResponseWriter, resp rpcResponse) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(resp)
}

func toolResult(v any) map[string]any {
	b, _ := json.MarshalIndent(v, "", "  ")
	return map[string]any{
		"content": []map[string]any{{"type": "text", "text": string(b)}},
	}
}

func toolError(err error) map[string]any {
	return map[string]any{
		"isError": true,
		"content": []map[string]any{{"type": "text", "text": err.Error()}},
	}
}

func obj(props map[string]any, required ...string) map[string]any {
	m := map[string]any{"type": "object", "properties": props}
	if len(required) > 0 {
		m["required"] = required
	}
	return m
}

func str(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }
func num(desc string) map[string]any { return map[string]any{"type": "integer", "description": desc} }

func mcpTools() []mcpTool {
	return []mcpTool{
		{
			Name:        "list_connections",
			Description: "List saved Redis connections available to this token.",
			InputSchema: obj(map[string]any{}),
		},
		{
			Name:        "open_session",
			Description: "Open a session for a connection and return its sessionId.",
			InputSchema: obj(map[string]any{"connectionId": str("connection id")}, "connectionId"),
		},
		{
			Name:        "close_session",
			Description: "Close an open session.",
			InputSchema: obj(map[string]any{"sessionId": str("session id")}, "sessionId"),
		},
		{
			Name:        "scan_keys",
			Description: "SCAN keys in a database (cluster-wide when applicable).",
			InputSchema: obj(map[string]any{
				"sessionId": str("session id"),
				"db":        num("database index (default 0)"),
				"match":     str("glob pattern (default *)"),
				"count":     num("page size hint"),
				"type":      str("type filter"),
				"cursor":    str("opaque cursor from a previous call"),
			}, "sessionId"),
		},
		{
			Name:        "get_key",
			Description: "Get a key's type, TTL, size and value.",
			InputSchema: obj(map[string]any{
				"sessionId": str("session id"),
				"key":       str("key name"),
				"db":        num("database index"),
			}, "sessionId", "key"),
		},
		{
			Name:        "set_key",
			Description: "Set a string key (requires write scope).",
			InputSchema: obj(map[string]any{
				"sessionId": str("session id"),
				"key":       str("key name"),
				"value":     str("value"),
				"db":        num("database index"),
				"ttl":       num("TTL seconds (0 = keep)"),
			}, "sessionId", "key", "value"),
		},
		{
			Name:        "delete_key",
			Description: "Delete a key (requires write scope).",
			InputSchema: obj(map[string]any{
				"sessionId": str("session id"),
				"key":       str("key name"),
				"db":        num("database index"),
			}, "sessionId", "key"),
		},
		{
			Name:        "run_command",
			Description: "Run an arbitrary Redis command (requires write scope).",
			InputSchema: obj(map[string]any{
				"sessionId": str("session id"),
				"command":   str("command line, e.g. INFO memory"),
				"db":        num("database index"),
			}, "sessionId", "command"),
		},
		{
			Name:        "server_info",
			Description: "Return INFO sections for the server.",
			InputSchema: obj(map[string]any{
				"sessionId": str("session id"),
				"db":        num("database index"),
			}, "sessionId"),
		},
	}
}

func (s *Server) mcpCall(ctx context.Context, params json.RawMessage) (any, *rpcError) {
	var call struct {
		Name      string         `json:"name"`
		Arguments map[string]any `json:"arguments"`
	}
	if err := json.Unmarshal(params, &call); err != nil {
		return nil, &rpcError{Code: -32602, Message: "invalid params"}
	}
	args := call.Arguments
	p := principalFromContext(ctx)

	write := func() error {
		if p.Role == account.RoleViewer {
			return errors.New("this token has read-only scope")
		}
		return nil
	}

	switch call.Name {
	case "list_connections":
		out := []map[string]any{}
		for _, c := range s.store.List() {
			if p.allows(c.ID) {
				pub := c.Public()
				out = append(out, map[string]any{
					"id": pub.ID, "name": pub.Name, "host": pub.Host, "port": pub.Port, "mode": pub.Mode, "db": pub.DB,
				})
			}
		}
		return toolResult(out), nil

	case "open_session":
		connID := argString(args, "connectionId")
		conn, err := s.store.Get(connID)
		if err != nil {
			return toolError(fmt.Errorf("connection not found: %s", connID)), nil
		}
		if !p.allows(conn.ID) {
			return toolError(errors.New("not allowed to access this connection")), nil
		}
		openCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		s.sessions.CloseByConn(connID)
		sess, err := s.sessions.Open(openCtx, newID(), conn)
		if err != nil {
			return toolError(err), nil
		}
		return toolResult(map[string]any{
			"sessionId": sess.ID, "name": sess.Name, "db": conn.DB,
		}), nil

	case "close_session":
		if err := s.sessions.Close(argString(args, "sessionId")); err != nil {
			return toolError(err), nil
		}
		return toolResult(map[string]any{"ok": true}), nil

	case "scan_keys":
		sess, err := s.mcpSession(args, p)
		if err != nil {
			return toolError(err), nil
		}
		db := argInt(args, "db", 0)
		count := int64(argInt(args, "count", 100))
		scanCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		if sess.IsCluster() {
			keys, next, err := sess.ScanClusterKeys(scanCtx, argString(args, "match"), count, argString(args, "type"), true, argString(args, "cursor"))
			if err != nil {
				return toolError(err), nil
			}
			return toolResult(map[string]any{"keys": keys, "cursor": next}), nil
		}
		cursor := uint64(0)
		if v := argString(args, "cursor"); v != "" {
			fmt.Sscanf(v, "%d", &cursor)
		}
		keys, next, err := sess.ScanKeys(scanCtx, db, cursor, argString(args, "match"), count, argString(args, "type"), true)
		if err != nil {
			return toolError(err), nil
		}
		return toolResult(map[string]any{"keys": keys, "cursor": fmt.Sprintf("%d", next)}), nil

	case "get_key":
		sess, err := s.mcpSession(args, p)
		if err != nil {
			return toolError(err), nil
		}
		key := argString(args, "key")
		if key == "" {
			return toolError(errors.New("key is required")), nil
		}
		getCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		detail, err := sess.GetKey(getCtx, argInt(args, "db", 0), key, 0, 200, "*")
		if err != nil {
			return toolError(err), nil
		}
		return toolResult(detail), nil

	case "set_key":
		if err := write(); err != nil {
			return toolError(err), nil
		}
		sess, err := s.mcpSession(args, p)
		if err != nil {
			return toolError(err), nil
		}
		m := redisclient.Mutation{
			DB: argInt(args, "db", 0), Key: argString(args, "key"),
			Action: "string.set", Value: argString(args, "value"),
		}
		if ttl := argInt(args, "ttl", 0); ttl > 0 {
			m.HasTTL = true
			m.TTL = int64(ttl)
		}
		setCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		if _, err := sess.Apply(setCtx, m); err != nil {
			return toolError(err), nil
		}
		return toolResult(map[string]any{"ok": true}), nil

	case "delete_key":
		if err := write(); err != nil {
			return toolError(err), nil
		}
		sess, err := s.mcpSession(args, p)
		if err != nil {
			return toolError(err), nil
		}
		delCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		n, err := sess.Delete(delCtx, argInt(args, "db", 0), argString(args, "key"))
		if err != nil {
			return toolError(err), nil
		}
		return toolResult(map[string]any{"ok": true, "deleted": n}), nil

	case "run_command":
		if err := write(); err != nil {
			return toolError(err), nil
		}
		sess, err := s.mcpSession(args, p)
		if err != nil {
			return toolError(err), nil
		}
		cmdCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		res, err := sess.RunCommand(cmdCtx, argInt(args, "db", 0), strings.TrimSpace(argString(args, "command")))
		if err != nil {
			return toolError(err), nil
		}
		return toolResult(res), nil

	case "server_info":
		sess, err := s.mcpSession(args, p)
		if err != nil {
			return toolError(err), nil
		}
		infoCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		defer cancel()
		info, err := sess.ServerInfo(infoCtx, argInt(args, "db", 0))
		if err != nil {
			return toolError(err), nil
		}
		return toolResult(info), nil
	}

	return nil, &rpcError{Code: -32602, Message: "unknown tool: " + call.Name}
}

func (s *Server) mcpResources(ctx context.Context) []map[string]any {
	p := principalFromContext(ctx)
	out := []map[string]any{}
	for _, c := range s.store.List() {
		if !p.allows(c.ID) {
			continue
		}
		pub := c.Public()
		out = append(out, map[string]any{
			"uri":         "redisui://connection/" + pub.ID,
			"name":        pub.Name,
			"description": fmt.Sprintf("%s:%d mode=%s db=%d", pub.Host, pub.Port, pub.Mode, pub.DB),
			"mimeType":    "application/json",
		})
	}
	return out
}

func (s *Server) mcpReadResource(ctx context.Context, params json.RawMessage) (any, *rpcError) {
	var req struct {
		URI string `json:"uri"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, &rpcError{Code: -32602, Message: "invalid params"}
	}
	id := strings.TrimPrefix(req.URI, "redisui://connection/")
	if id == "" || id == req.URI {
		return nil, &rpcError{Code: -32602, Message: "unsupported resource uri"}
	}
	p := principalFromContext(ctx)
	c, err := s.store.Get(id)
	if err != nil {
		return nil, &rpcError{Code: -32002, Message: "connection not found"}
	}
	if !p.allows(c.ID) {
		return nil, &rpcError{Code: -32003, Message: "not allowed to access this connection"}
	}
	b, _ := json.MarshalIndent(c.Public(), "", "  ")
	return map[string]any{"contents": []map[string]any{{
		"uri": req.URI, "mimeType": "application/json", "text": string(b),
	}}}, nil
}

func (s *Server) mcpSession(args map[string]any, p principal) (*redisclient.Session, error) {
	sid := argString(args, "sessionId")
	if sid == "" {
		return nil, errors.New("sessionId is required")
	}
	sess, err := s.sessions.Get(sid)
	if err != nil {
		if errors.Is(err, session.ErrNotFound) {
			return nil, errors.New("session not found")
		}
		return nil, err
	}
	if !p.allows(sess.ConnID) {
		return nil, errors.New("not allowed to access this connection")
	}
	return sess, nil
}

func argString(args map[string]any, key string) string {
	if v, ok := args[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func argInt(args map[string]any, key string, def int) int {
	if v, ok := args[key]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		case json.Number:
			if i, err := n.Int64(); err == nil {
				return int(i)
			}
		}
	}
	return def
}

// principalFromContext mirrors principalFrom for a bare context.
func principalFromContext(ctx context.Context) principal {
	if p, ok := ctx.Value(principalContextKey).(principal); ok {
		return p
	}
	return principal{Role: account.RoleAdmin, Root: true}
}
