#!/usr/bin/env sh
# RedisUI installer: downloads the latest (or a pinned) release binary and
# optionally installs a systemd service.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/holihur/redisui/master/install.sh | sh
#   sh install.sh --version v0.1.0
#   sh install.sh --systemd            # install + enable a systemd unit
#   sh install.sh --no-update          # disable self-update in the unit
set -eu

REPO="${REDISUI_REPO:-holihur/redisui}"
PREFIX="${PREFIX:-/usr/local}"
DATA_DIR="${REDISUI_DATA_DIR:-/var/lib/redisui}"
ADDR="${REDISUI_ADDR:-0.0.0.0:8080}"
VERSION="${REDISUI_VERSION:-latest}"
WITH_SERVICE=0
NO_UPDATE=0
NO_UPDATE_ARG=""

usage() {
  cat <<EOF
RedisUI installer

Options:
  --version <tag>   Install a specific release tag (default: latest)
  --repo <o/r>      GitHub repo (default: $REPO)
  --systemd         Install and enable a systemd service
  --no-update       Add -no-update to the service
  -h, --help        Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version) shift; VERSION="${1:?missing version}" ;;
    --repo) shift; REPO="${1:?missing repo}" ;;
    --systemd) WITH_SERVICE=1 ;;
    --no-update) NO_UPDATE=1; NO_UPDATE_ARG=" -no-update" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage; exit 1 ;;
  esac
  shift
done

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

asset="redisui_${os}_${arch}.tar.gz"
if [ "$VERSION" = "latest" ]; then
  base="https://github.com/${REPO}/releases/latest/download"
else
  base="https://github.com/${REPO}/releases/download/${VERSION}"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fetch() {
  url="$1"; out="$2"
  if command -v curl >/dev/null 2>&1; then curl -fL "$url" -o "$out"
  elif command -v wget >/dev/null 2>&1; then wget -qO "$out" "$url"
  else echo "need curl or wget" >&2; exit 1; fi
}

echo "Downloading ${base}/${asset}"
fetch "$base/$asset" "$tmp/$asset"

# Verify checksum when published.
if fetch "$base/checksums.txt" "$tmp/checksums.txt" 2>/dev/null; then
  if [ -s "$tmp/checksums.txt" ]; then
    ( cd "$tmp" && grep " ${asset}\$" checksums.txt | sha256sum -c - ) || {
      echo "checksum verification failed" >&2; exit 1;
    }
    echo "Checksum OK"
  fi
fi

tar -C "$tmp" -xzf "$tmp/$asset"

install_dir="${PREFIX}/bin"
echo "Installing to ${install_dir}/redisui"
if [ -w "$install_dir" ] 2>/dev/null || mkdir -p "$install_dir" 2>/dev/null; then
  install -m 0755 "$tmp/redisui" "${install_dir}/redisui"
else
  sudo mkdir -p "$install_dir"
  sudo install -m 0755 "$tmp/redisui" "${install_dir}/redisui"
fi

if [ "$WITH_SERVICE" = "1" ]; then
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "--systemd requested but systemctl not found; skipping" >&2
    exit 0
  fi
  SUDO=""
  [ "$(id -u)" = "0" ] || SUDO="sudo"
  $SUDO mkdir -p "$DATA_DIR"
  $SUDO chmod 700 "$DATA_DIR"
  unit="/etc/systemd/system/redisui.service"
  $SUDO tee "$unit" >/dev/null <<EOF
[Unit]
Description=RedisUI
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${install_dir}/redisui -addr ${ADDR} -data ${DATA_DIR}${NO_UPDATE_ARG}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now redisui
  sleep 1
  echo
  echo "RedisUI service started."
  echo "Access token:"
  $SUDO cat "$DATA_DIR/token" 2>/dev/null || echo "  (check: journalctl -u redisui | grep 'access token')"
  echo
  echo "URL: http://$(hostname -I 2>/dev/null | awk '{print $1}'):${ADDR##*:}/"
else
  echo
  echo "Installed. Start it with:"
  echo "  redisui -addr ${ADDR} -data ./data"
  echo "The first run prints an access token."
fi
