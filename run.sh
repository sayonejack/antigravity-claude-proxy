#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="${HOME}/.config/antigravity-proxy"
CONFIG_FILE="${CONFIG_DIR}/config.json"
PORT="${PORT:-8787}"
HOST="${HOST:-127.0.0.1}"

log() {
  printf '[run.sh] %s\n' "$*"
}

log "root directory: ${ROOT_DIR}"
log "config directory: ${CONFIG_DIR}"
log "config file: ${CONFIG_FILE}"
log "listen address: ${HOST}:${PORT}"

mkdir -p "${CONFIG_DIR}"

if [[ ! -f "${CONFIG_FILE}" && -f "${ROOT_DIR}/config.example.json" ]]; then
  cp "${ROOT_DIR}/config.example.json" "${CONFIG_FILE}"
  log "copied default config to ${CONFIG_FILE}"
else
  log "config file already present or no example file found"
fi

cd "${ROOT_DIR}"

if [[ ! -d node_modules ]]; then
  log "node_modules not found, running npm install"
  npm install
  log "npm install completed"
else
  log "node_modules already present, skipping npm install"
fi

log "starting antigravity-claude-proxy in foreground"
exec env HOST="${HOST}" PORT="${PORT}" npm start -- --log
