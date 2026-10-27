#!/usr/bin/env bash
# Builds the frontend, embeds it into the Go binary and writes ./redisui.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${VERSION:-dev}"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

say "Building frontend"
cd "$ROOT/frontend"
pnpm install --frozen-lockfile
pnpm run build

say "Embedding frontend"
rm -rf "$ROOT/backend/web"
mkdir -p "$ROOT/backend/web"
cp -r "$ROOT/frontend/dist/." "$ROOT/backend/web/"
touch "$ROOT/backend/web/.gitkeep"

say "Building backend ($VERSION)"
cd "$ROOT/backend"
CGO_ENABLED=0 go build -trimpath \
  -ldflags "-s -w -X main.version=${VERSION}" \
  -o "$ROOT/redisui" .

say "Done: $ROOT/redisui ($VERSION)"
