#!/usr/bin/env bash
# The e2e suite (e2e/tests/): build the image from this checkout, run it twice
# as throwaway containers, run Playwright against them, then remove both
# containers and the image again.
#
#   scripts/e2e.sh [playwright args]          # e.g. -g 'import' --repeat-each=3
#
# PORT_BASE (default 25500): the app on 127.0.0.1:PORT_BASE, the same image
# with Basic Auth (and WOL_RATE_LIMIT_HOST_WAKEUP=1) on PORT_BASE+1.
# COMPOSE_PROJECT_NAME (default wake-on-lan_plus_e2e): the image and container
# name (the auth container gets -auth); only names ending in _docs or _e2e.
# ARTIFACTS: Playwright results, report and container logs (default: a temp
# dir). Node and `npm ci` in e2e/ are the caller's.
#
# No compose, as in docs-screenshots.sh: docker-compose.yml needs macvlan.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ARTIFACTS="${ARTIFACTS:-$(mktemp -d)}"
mkdir -p "$ARTIFACTS"
PORT_BASE="${PORT_BASE:-25500}"
NAME="${COMPOSE_PROJECT_NAME:-wake-on-lan_plus_e2e}"
NAME="${NAME,,}"

case "$NAME" in
  *_docs | *_e2e) ;;
  *) echo "e2e: refusing '$NAME' (only *_docs or *_e2e)" >&2
     exit 1 ;;
esac

# Remove only what this run created: a clashing name is someone else's.
built='' started=()
teardown() {
  rc=$?
  for c in "${started[@]}"; do
    docker logs "$c" >"$ARTIFACTS/$c.log" 2>&1 || true
    docker rm -f "$c" >/dev/null 2>&1 || true
  done
  [ -z "$built" ] || docker rmi "$NAME" >/dev/null 2>&1 || true
  exit "$rc"
}
trap teardown EXIT

docker build -q -t "$NAME" . >/dev/null
built=1
docker run -d --name "$NAME" -p "127.0.0.1:$PORT_BASE:80" "$NAME" >/dev/null
started+=("$NAME")
docker run -d --name "$NAME-auth" -p "127.0.0.1:$((PORT_BASE + 1)):80" \
  -e WOL_USERNAME=e2e-admin -e WOL_PASSWORD=e2e-password-not-secret \
  -e WOL_RATE_LIMIT_HOST_WAKEUP=1 "$NAME" >/dev/null
started+=("$NAME-auth")
# The HEALTHCHECK only runs every 30 s; ask Apache directly (401 = up).
for port in "$PORT_BASE" "$((PORT_BASE + 1))"; do
  for i in $(seq 30); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/" || true)" != 000 ] && break
    [ "$i" = 30 ] && { echo "e2e: the app on $port did not come up" >&2; exit 1; }
    sleep 1
  done
done

cd e2e
E2E_BASE_URL="http://127.0.0.1:$PORT_BASE" \
  E2E_AUTH_URL="http://127.0.0.1:$((PORT_BASE + 1))" \
  E2E_CONTAINER="$NAME" \
  E2E_REPORT="$ARTIFACTS/playwright-report" \
  npx playwright test --output "$ARTIFACTS/test-results" "$@"
