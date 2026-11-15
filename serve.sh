#!/usr/bin/env bash
# Serve RHEL Fieldbook locally. Usage: ./serve.sh [port]
set -euo pipefail

PORT="${1:-8799}"
cd "$(dirname "$0")"

echo "RHEL Fieldbook → http://127.0.0.1:${PORT}/"
echo "Press Ctrl+C to stop."

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v python >/dev/null 2>&1; then
  exec python -m http.server "$PORT" --bind 127.0.0.1
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "$PORT" .
else
  echo "No static server found. Install Python or Node, or open index.html directly." >&2
  exit 1
fi
