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
- Profiler: live `MONITOR` command stream (`SSE`)

**Connectivity**
- Direct, Sentinel (master name + sentinel auth) and Cluster modes
- SSH jump host with optional pinned host-key fingerprint
- Optional TLS to Redis (with certificate verification)

**Bulk & portability**
- Delete keys by pattern (with type-to-confirm)
- Export/import keys via `DUMP`/`RESTORE` as JSON

**Module support**
- Module list (`MODULE LIST`) in the server info panel
- RedisJSON: view and edit documents (`JSON.GET`/`JSON.SET`)
- RedisTimeSeries: view recent samples and add samples (`TS.INFO`, `TS.RANGE`, `TS.ADD`)
- RedisBloom family: view info and add items
  (`BF.ADD`, `CF.ADD`, `TOPK.ADD`, `CMS.INCRBY`, `TDIGEST.ADD`; TopK items listed)
- RediSearch: browse/query indexes and create, alter or drop them
  (`FT._LIST`, `FT.SEARCH`, `FT.INFO`, `FT.CREATE`, `FT.ALTER`, `FT.DROPINDEX`)
- Other module types degrade gracefully with a hint to the console

**Security & remote access**
- Multi-user accounts with roles: `admin`, `operator`, `viewer`
- Per-user connection scope (restrict which connections a user sees)
- Bearer/access-token authentication with brute-force login throttling
- Optional read-only token for safe, view-only access
- Credentials (Redis password, SSH password/key/passphrase) encrypted at rest
  with AES-256-GCM
- Optional native TLS (`-tls-cert`/`-tls-key`), reverse-proxy aware
- SSH jump host with optional pinned host-key fingerprint

> For Sentinel, provide the master name and one or more sentinel addresses.
> For Cluster, provide one or more seed node addresses.

## Install (one command)

Builds are published as self-contained binaries (the frontend is embedded), so
there is no separate web directory to manage.

```bash
# install the latest release into /usr/local/bin
curl -fsSL https://raw.githubusercontent.com/holihur/redisui/master/install.sh | sh

# or install and enable a systemd service (binds 0.0.0.0:8080, data in /var/lib/redisui)
sh install.sh --systemd

# pin a version / disable self-update
sh install.sh --version v0.1.0
sh install.sh --systemd --no-update
```

`install.sh` detects OS/arch, downloads the matching release, verifies the
sha256 checksum, installs the binary and (with `--systemd`) sets up a unit. The
generated access token is stored in `<data-dir>/token` and printed on first run.

Build from source (Go + pnpm):

```bash
VERSION=v0.1.0 bash scripts/build.sh   # -> ./redisui with embedded frontend
```

## Quick start

Run the single binary:

```bash
./redisui -addr 0.0.0.0:8080 -data ./data
```

On first run the server prints an **access token** and stores it in
`data/token`. Open `http://<host>:8080/`, paste the token (or sign in as a
user), and connect a Redis server. To serve an external frontend build instead
of the embedded one, pass `-static /path/to/dist`.

## Updates

RedisUI can update itself from GitHub releases. By default it checks every
**10 minutes** and applies a newer release automatically, then restarts:

```bash
redisui                            # check every 10m, auto-apply
redisui -update-interval 1h        # check hourly
redisui -no-update                 # disable checking entirely
redisui -update-auto=false         # check but never auto-apply
redisui -update-repo owner/name    # use a fork
```

Admins can also check/apply manually under **Diagnostics → About & updates**.
Self-update never runs for development builds (`-version` reports `dev`).

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
| `-static` | _(embedded)_ | Serve an external frontend build instead |
| `-auth-token` | _(generated)_ | Access token for remote clients |
| `-readonly-token` | — | Read-only access token (GET/open only) |
| `-no-auth` | `false` | Disable authentication |
| `-tls-cert` / `-tls-key` | — | Enable HTTPS |
| `-cors-origin` | _(same-origin)_ | Optional CORS origin |
| `-trust-proxy` | `false` | Trust `X-Forwarded-For`/`X-Real-IP` |
| `-update-repo` | `holihur/redisui` | GitHub repo for self-update |
| `-update-interval` | `10m` | How often to check for updates |
| `-update-auto` | `true` | Auto-apply updates (`false` = notify only) |
| `-no-update` | `false` | Disable the self-update checker |
| `-version` | — | Print version and exit |

Environment variables:

| Variable | Description |
| --- | --- |
| `REDISUI_AUTH_TOKEN` | Access token (overrides the generated file) |
| `REDISUI_READONLY_TOKEN` | Read-only access token |
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
cd backend && go test ./...                 # unit + integration
cd frontend && pnpm run test                # vitest
cd frontend && pnpm run typecheck
cd frontend && pnpm exec playwright install chromium
cd frontend && pnpm run e2e                  # Playwright (needs a running server)
```

The Playwright suite expects a running RedisUI (default `http://127.0.0.1:8093`)
with an access token in `E2E_TOKEN` and a Redis reachable at `127.0.0.1:6379`.
See `.github/workflows/e2e.yml` for the full setup.

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

## Users & roles

Admins sign in with the access token and create accounts under
**Diagnostics → Users** (or via `POST /api/users`). Accounts are stored in
`<data-dir>/users.json` (bcrypt hashes, 0600).

| Role | Read | Write | Manage connections | Manage users |
| --- | --- | --- | --- | --- |
| `admin` | ✅ | ✅ | ✅ | ✅ |
| `operator` | ✅ | ✅ | — | — |
| `viewer` | ✅ | — | — | — |

A user's **connection scope** limits which saved connections they can see and
open; leaving it empty grants all connections.

## Known limitations

- Cluster key browsing aggregates a bounded sample across masters; it is not a
  full cluster-wide cursor, and `SCAN`-based pagination is per-node in the raw
  protocol.
- Multi-user accounts cover role + connection scope, but there is no
  per-command or per-key ACL.
- Redis module support covers JSON (edit), TimeSeries (view + add), the
  RedisBloom family (view + add) and RediSearch (query + index management);
  other module types are shown read-only with a hint.

## License

MIT
