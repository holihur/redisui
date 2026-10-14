# RedisUI

[![CI](https://github.com/holihur/redisui/actions/workflows/ci.yml/badge.svg)](https://github.com/holihur/redisui/actions/workflows/ci.yml)

A modern, self-hosted Redis GUI. Single Go binary that serves a React SPA, with
SSH tunnels, a `:`-delimited key tree, encrypted credentials at rest, and
token-based remote access.

## Features

**Browsing & editing**
- `:`-delimited namespace tree with a virtualized list (handles large keyspaces)
- String, hash, list, set, sorted set and stream editors
- Create, rename, delete keys; edit TTLs; paginate large collections
- Command console with history (`Ctrl/Cmd+K`)
- Full-text pattern search and type filter (server-side `SCAN`)

**Diagnostics & tools**
- Server `INFO` viewer
- Slow log viewer (`SLOWLOG GET`)
- Memory analysis: `INFO memory`, `MEMORY DOCTOR`, largest sampled keys
- Connected clients (`CLIENT LIST`)
- Pub/Sub monitor with live streaming and publish (`SSE`)

**Bulk & portability**
- Delete keys by pattern (with type-to-confirm)
- Export/import keys via `DUMP`/`RESTORE` as JSON

**Security & remote access**
- Bearer-token authentication with brute-force login throttling
- Credentials (Redis password, SSH password/key/passphrase) encrypted at rest
  with AES-256-GCM
- Optional native TLS (`-tls-cert`/`-tls-key`), reverse-proxy aware
- SSH jump host with optional pinned host-key fingerprint

## Quick start

Build the frontend and backend, then run the single binary:

```bash
# frontend
cd frontend && pnpm install && pnpm run build

# backend
cd ../backend && go build -o redisui .
./redisui -addr 0.0.0.0:8080 -data ./data -static ../frontend/dist
```

On first run the server prints an **access token** and stores it in
`data/token`. Open `http://<host>:8080/`, paste the token, and connect a Redis
server.

## Remote access

The default `-addr 0.0.0.0:8080` is reachable from other machines. Because the
UI can run arbitrary Redis commands, **always** keep authentication enabled for
remote access:

- Set a stable token with `-auth-token` or `REDISUI_AUTH_TOKEN`, otherwise one is
  generated into `<data>/token`.
- Terminate TLS. Either pass `-tls-cert`/`-tls-key`, or put the app behind a
  reverse proxy and run with `-addr 127.0.0.1:8080 -trust-proxy`.
- Disable auth only for trusted local use: `-no-auth`.

Example behind Caddy (automatic HTTPS):

```
redis.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

## Configuration

| Flag | Default | Description |
| --- | --- | --- |
| `-addr` | `0.0.0.0:8080` | HTTP listen address |
| `-data` | `./data` | Directory for profiles, master key and token |
| `-static` | `./web` | Directory of the built frontend |
| `-auth-token` | _(generated)_ | Access token for remote clients |
| `-no-auth` | `false` | Disable authentication |
| `-tls-cert` / `-tls-key` | — | Enable HTTPS |
| `-cors-origin` | _(same-origin)_ | Optional CORS origin |
| `-trust-proxy` | `false` | Trust `X-Forwarded-For`/`X-Real-IP` |

Environment variables:

| Variable | Description |
| --- | --- |
| `REDISUI_AUTH_TOKEN` | Access token (overrides the generated file) |
| `REDISUI_MASTER_KEY` | Encryption key: 64 hex chars, or any passphrase (SHA-256 derived) |
| `REDISUI_DISABLE_ENCRYPTION` | Set to `1` to store secrets in plaintext (not recommended) |

## Docker

```bash
docker build -t redisui .
docker run -d --name redisui -p 8080:8080 -v redisui-data:/data redisui
docker logs redisui            # prints the access token
```

Or with Compose:

```bash
docker compose up -d
```

## Development

Toolchain versions are pinned with [mise](https://mise.jdx.dev/) and pnpm.

```bash
mise install                   # go 1.26.2, node 26.8.2, pnpm 12.4.1
cd frontend && pnpm install && pnpm run dev   # Vite dev server on :5173
cd backend && go run .                        # API on :8080
```

The Vite dev server proxies `/api` to `http://localhost:8080`.

### Tests

```bash
cd backend && go test ./...
cd frontend && pnpm run test      # vitest (key tree logic)
cd frontend && pnpm run typecheck
```

## Architecture

```
backend/                Go HTTP API + Redis client
  internal/api/         routes, auth middleware, tool endpoints
  internal/redisclient/ SCAN/browse/mutate, tools, pub/sub
  internal/secret/      AES-256-GCM helpers, master-key handling
  internal/store/       JSON connection store (encrypted secrets)
  internal/tunnel/      SSH tunnel
  internal/session/     live session manager
frontend/               React 19 + Vite + Tailwind v4 + Radix
  src/lib/keytree.ts    pure, tested key-tree logic
  src/components/app/   UI (tree, detail editors, tools)
```

## Known limitations

- Cluster and Sentinel discovery are not implemented yet; connect to a single
  endpoint (use a proxy/LB for cluster).
- No multi-user accounts; access is a single shared token.
- Redis module types (JSON, search, etc.) are shown as raw values.

## License

MIT
