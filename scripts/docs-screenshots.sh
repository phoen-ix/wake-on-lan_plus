#!/usr/bin/env bash
# Regenerate the docs screenshots: build the image from this checkout, run it
# as a throwaway container, seed it and run the docs tour (e2e/docs/) against
# it, then remove the container and the image again.
#
#   scripts/docs-screenshots.sh [outdir]      # default: docs/screenshots
#
# PORT_BASE (default 25500): the app on 127.0.0.1:PORT_BASE.
# COMPOSE_PROJECT_NAME (default wake-on-lan_plus_docs): the container and image
# name. Never `wake-on-lan_plus`, the container name docker-compose.yml gives a
# live install. ARTIFACTS: where Playwright's test results go (default: a temp
# dir). Node and `npm ci` in e2e/ are the caller's.
#
# No compose: docker-compose.yml needs a macvlan network and a LAN address.
# The tour needs neither, so a plain `docker run` on the default bridge.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/docs/screenshots}"
OUT="$(mkdir -p "$OUT" && cd "$OUT" && pwd)"
cd "$ROOT"
ARTIFACTS="${ARTIFACTS:-$(mktemp -d)}"
PORT_BASE="${PORT_BASE:-25500}"
NAME="${COMPOSE_PROJECT_NAME:-wake-on-lan_plus_docs}"
NAME="${NAME,,}"

case "$NAME" in
  wake-on-lan_plus | phytotron | phytotron-dev | vib | fileheron | keyb-dev)
    echo "docs-screenshots: refusing the live name '$NAME'" >&2
    exit 1 ;;
esac

teardown() {
  rc=$?
  [ "$rc" = 0 ] || docker logs --tail=200 "$NAME" >"$ARTIFACTS/container.log" 2>&1 || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker rmi "$NAME" >/dev/null 2>&1 || true
  exit "$rc"
}
trap teardown EXIT

docker build -q -t "$NAME" . >/dev/null
docker run -d --name "$NAME" -p "127.0.0.1:$PORT_BASE:80" "$NAME" >/dev/null
# The HEALTHCHECK only runs every 30 s; ask Apache directly.
for i in $(seq 30); do
  curl -fsS -o /dev/null "http://127.0.0.1:$PORT_BASE/" && break
  [ "$i" = 30 ] && { echo "docs-screenshots: the app did not come up" >&2; exit 1; }
  sleep 1
done

cd e2e
E2E_BASE_URL="http://127.0.0.1:$PORT_BASE" \
  DOCS_SCREENSHOT_DIR="$OUT" \
  npx playwright test -c playwright.docs.config.ts --output "$ARTIFACTS/test-results"
echo "docs-screenshots: $(find "$OUT" -name '*.png' | wc -l) PNGs in $OUT"
