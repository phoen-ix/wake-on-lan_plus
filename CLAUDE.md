@HANDOVER.md

## Commands

- Tests (need the `sockets` extension, so run them in the image):
  `docker build -t wol-test . && docker run --rm --entrypoint php -v "$PWD":/app:ro -w /app wol-test tests/test_functions.php`
- Lint: `php -l` on every PHP file (CI does it in the image, see `.github/workflows/ci.yml`).
- Docs screenshots: `(cd e2e && npm ci && npx playwright install chromium)`, then
  `scripts/docs-screenshots.sh [outdir]` (default `docs/screenshots/`), then
  `oxipng -o 4 --strip safe docs/screenshots/*.png`. Gallery: `docs/screenshots/README.md`.
- E2E suite: `(cd e2e && npm ci && npx playwright install chromium)`, then
  `scripts/e2e.sh [playwright args]` (e.g. `-g import`). Specs in `e2e/tests/`, the
  feature inventory in `e2e/COVERAGE.md` (add a row for every new feature).
- In the phoen-ix fleet: `fleet check wake-on-lan_plus` (runs the tests in the image),
  `--e2e` the e2e suite, `--with docs` the docs tour.

## Invariants

- Never `docker compose up` in this checkout for testing: `docker-compose.yml` needs an
  external macvlan network and a real LAN address (`192.168.1.x` is a placeholder). The
  docs tour uses `docker build` + `docker run` on the default bridge instead.
- Docs tour names and ports: container + image `wake-on-lan_plus_docs`
  (`COMPOSE_PROJECT_NAME` overrides), `127.0.0.1:${PORT_BASE:-25500}`; port block
  25500-25509. The script accepts only names ending in `_docs`/`_e2e` and removes only the
  container and image it created. On the fleet VM, never touch `phytotron-*` or `vib-*` containers.
- The tour mocks HOST.CHECK (the demo hosts do not exist) and serves every CDN file from
  `e2e/node_modules`. A request it cannot serve locally fails the test. Bumping a CDN
  version in `index.php` (or the Google Fonts `@import` in `assets/style.css`) needs:
  the new SRI hash, and the same exact version pinned in `e2e/package.json`.
- The tour's demo hosts use RFC 5737 addresses and `*.example` names, because the "wake"
  shot sends a real magic packet. Keep it that way.
- `#hostTable` (hidden) is the source of truth: `getConfiguration()` reads its rows and the
  cards mirror it. Every card change has to update both (see `syncCardsFromTable`, the
  sortable `stop` handler).
- `config.json` and `config_backups/` live in `WOL_CONFIG_DIR` (`/data` in the image,
  `./volume/config/` in compose), never in the web root. Never mount anything over
  `/var/www/html`: it hides `.htaccess` (`tests/test_functions.php` checks
  `docker-compose.yml`).
- `wake-on-lan_plus.php` is the pre-rewrite monolith: not in the image, blocked by
  `.htaccess`. Do not edit it; deleting it is the owner's call.
- i18n (`miniI18n` data at the end of `assets/app.js`) covers the options menu, the
  Load Configuration dialog text and the Add Host labels only. Every key needs a
  non-empty value in each language: an empty one blanks the element.
- `scripts/e2e.sh` runs the image twice: `wake-on-lan_plus_e2e` on `127.0.0.1:PORT_BASE` and
  `wake-on-lan_plus_e2e-auth` (Basic Auth `e2e-admin`, `WOL_RATE_LIMIT_HOST_WAKEUP=1`) on
  `PORT_BASE+1`. One Playwright worker: every test replaces the single `config.json`. A few
  tests `docker exec` into the open container (`E2E_CONTAINER`): broken config, entrypoint backups.
- Regression tests for app fixes go into the e2e suite (`e2e/tests/`, CI `e2e`); the docs
  tour keeps its older ones at the end of `e2e/docs/tour.spec.ts`.
- Commit style: plain imperative subject, no prefix. End with the Co-Authored-By trailer
  when an agent wrote it.
