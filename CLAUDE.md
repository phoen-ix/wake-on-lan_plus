# wake-on-lan_plus

PHP single page (no framework, no database) that sends Wake-on-LAN magic packets; the
hosts live in `config.json`. User docs: `README.md` (features, env vars, layout, roadmap).

## Architecture

- `index.php`: the AJAX operations (`?aop=`), then the HTML. CONFIG.GET / CONFIG.DOWNLOAD
  read `config.json`; CONFIG.SET (POST, CSRF, rate limit) validates an array of objects
  with `mac` + `host` and writes it atomically (temp file + `rename()`); HOST.CHECK (rate
  limit, saved hosts only) tries ports 3389/22/80/443/5938 with `fsockopen`, 3 s each;
  HOST.WAKEUP (POST, CSRF, rate limit) sends the packet via `wakeOnLan()`.
  New operation: one more `elseif`, with CSRF + `checkRateLimit()` if it changes state,
  and its client call in `assets/app.js`.
- `includes/auth.php`: session, Basic Auth (`WOL_USERNAME`/`WOL_PASSWORD`, `hash_equals`),
  the per-session CSRF token (`X-CSRF-TOKEN` header), then `session_write_close()`.
- `includes/functions.php`: `wakeOnLan()`, `checkRateLimit()`, `configFilename()`,
  `endWithJsonResponse()` / `endWithErrorMessage()`.
- `assets/app.js`: mini-i18n, the bootstrapChoice jQuery plugin, `WolSettings`
  (`localStorage` key `wol_settings`; defaults when it is unavailable), the cards, the
  status poller (one host per tick), toasts.
- No CSP header on purpose: the inline `window.WOL_CONFIG` bridge and the template
  engine's `new Function()` would need `unsafe-inline` + `unsafe-eval`.
- CI (`ci.yml`) publishes `ghcr.io/phoen-ix/wake-on-lan_plus` (amd64 + arm64) after the
  `test` job: `latest` + `sha-<short>` from `master`, `X.Y.Z` from a `vX.Y.Z` tag.

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
  jQuery is not from a CDN: `assets/vendor/jquery-<version>.min.js` (the npm package's
  `dist/jquery.min.js`, unchanged) and its `<script>` tag in `index.php`.
- The tour's demo hosts use RFC 5737 addresses and `*.example` names, because the "wake"
  shot sends a real magic packet. Keep it that way.
- `#hostTable` (hidden) is the source of truth: `getConfiguration()` reads its rows and the
  cards mirror it. Every card change has to update both (see `syncCardsFromTable`, the
  sortable `stop` handler).
- `config.json` and `config_backups/` live in `WOL_CONFIG_DIR` (`/data` in the image,
  `./volume/config/` in compose), never in the web root. Never mount anything over
  `/var/www/html`: it hides `.htaccess` (`tests/test_functions.php` checks
  `docker-compose.yml`).
- i18n (`miniI18n` data at the end of `assets/app.js`) covers the options menu, the
  Load Configuration dialog text and the Add Host labels only. Every key needs a
  non-empty value in each language: an empty one blanks the element.
- `scripts/e2e.sh` runs the image twice: `wake-on-lan_plus_e2e` (`WOL_DEBUG=1`) on `127.0.0.1:PORT_BASE` and
  `wake-on-lan_plus_e2e-auth` (Basic Auth `e2e-admin`, `WOL_RATE_LIMIT_HOST_WAKEUP=1`) on
  `PORT_BASE+1`. One Playwright worker: every test replaces the single `config.json`. A few
  tests `docker exec` into the open container (`E2E_CONTAINER`): broken config, entrypoint backups,
  the UDP sink that checks the magic packet.
- Rate limits count per client IP in `/tmp/wol-rate-limit.json` (`checkRateLimit`), and every
  test request comes from the same IP: the e2e `guard` fixture deletes the file in both
  containers before each test, the docs tour runs with `WOL_RATE_LIMIT_CONFIG_SET=1000`.
- Regression tests for app fixes go into the e2e suite (`e2e/tests/`, CI `e2e`); the docs
  tour keeps its older ones at the end of `e2e/docs/tour.spec.ts`.
- Commit style: plain imperative subject, no prefix. End with the Co-Authored-By trailer
  when an agent wrote it.
