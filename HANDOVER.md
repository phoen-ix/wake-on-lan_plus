# Handover Document — wake-on-lan_plus (Refactored Edition)

## 1. Overview

This project is a security-hardened, modular rewrite of [phoen-ix/wake-on-lan_plus](https://github.com/phoen-ix/wake-on-lan_plus) — a PHP web application for sending Wake-on-LAN magic packets to hosts on a local network.

The **original** project was a single monolithic PHP file (`wake-on-lan_plus.php`) containing all backend logic, HTML, CSS, and JavaScript inline. This refactored version splits it into a clean modular structure and adds significant security hardening.

---

## 2. What Changed (Original vs. Refactored)

### 2.1 Architecture — Monolith to Modular

| Original | Refactored |
|---|---|
| `wake-on-lan_plus.php` (everything inline) | `index.php` — entry point, AJAX routing, HTML |
| | `includes/auth.php` — authentication, CSRF tokens, token rotation |
| | `includes/functions.php` — core WoL functions, helpers |
| | `assets/app.js` — mini-i18n, bootstrapChoice, WolSettings manager, card rendering, toast notifications, main app |
| | `assets/style.css` — CSS custom properties, dark/light themes, card grid, settings panel, toast system |
| No tests | `tests/test_functions.php` — unit tests |

The original monolith file is retained in the repo (not copied into the image) and blocked from web access via `.htaccess`.

### 2.2 Security Additions

These features did **not** exist in the original:

| Feature | Implementation | Files |
|---|---|---|
| **CSRF protection** | 32-byte random hex token stored in session, validated on CONFIG.SET and HOST.WAKEUP via `X-CSRF-TOKEN` header | `includes/auth.php`, `index.php`, `assets/app.js` |
| **CSRF token rotation** | Token is regenerated after every successful CONFIG.SET and HOST.WAKEUP; new token returned in JSON response and picked up by JS client | `includes/auth.php`, `index.php`, `assets/app.js` |
| **Rate limiting** | Session-based, per action, configurable via env vars (see Environment Variables) | `includes/functions.php`, `index.php` |
| **HTTP Basic Auth** | Optional, via `WOL_USERNAME`/`WOL_PASSWORD` env vars, timing-safe comparison | `includes/auth.php` |
| **SSRF prevention** | Strict allowlist on HOST.CHECK `host` param — only `[a-zA-Z0-9.\-:]` allowed, max 253 chars | `index.php` (HOST.CHECK) |
| **Security headers** | `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy` | `index.php` (before the HTML), `endWithJsonResponse()` |
| **Config outside the web root** | `config.json` and `config_backups/` live in `WOL_CONFIG_DIR` (the image sets `/data`; unset = next to `index.php`) | `index.php`, `Dockerfile`, `entrypoint.sh`, `docker-compose.yml` |
| **`.htaccess` rules** | Blocks direct access to `config.json` (and its temp files and backups), the old monolith file, and the `includes/` directory | `.htaccess`, `includes/.htaccess` |
| **JSON validation** | CONFIG.SET validates that input is an array of objects with `mac` and `host` fields; CONFIG.GET uses `JSON_THROW_ON_ERROR` | `index.php` (CONFIG.GET, CONFIG.SET) |
| **Atomic file writes** | Config saves write to a temp file then `rename()` for crash-safe atomic swap | `index.php` (CONFIG.SET) |
| **MAC regex fix** | Regex anchored with `^`/`$`, consistent `[A-F0-9]` character class to prevent partial matches | `wakeOnLan()` |
| **POST for wakeup** | HOST.WAKEUP changed from GET to POST (prevents CSRF via URL) | `index.php` (HOST.WAKEUP), `assets/app.js` |

### 2.3 Docker Changes

| Aspect | Original | Refactored |
|---|---|---|
| Base image | `ubuntu:jammy-20240212` + `ppa:ondrej/php` | official `php:<version>-apache` (tag pinned in `Dockerfile`) |
| File copy | Copies single `wake-on-lan_plus.php` as `index.php` | Copies `index.php`, `includes/`, `assets/`, `.htaccess` |
| Apache config | Default | Unchanged: `AllowOverride All` for `/var/www/` (the `.htaccess` files) comes from the base image's `docker-php.conf` |
| CMD | `apachectl -D FOREGROUND` | `apache2-foreground` (official entrypoint) |
| Env vars | None | Image sets `WOL_CONFIG_DIR=/data`; compose passes `WOL_USERNAME`/`WOL_PASSWORD` and `WOL_RATE_LIMIT_*` |
| Volume mounts | Single `.php` file + config volume | `./volume/config/` at `/data` only; the app code is the image's |
| HEALTHCHECK | None | `curl -f http://localhost/` every 30s with 5s timeout, 3 retries |
| Config backup | None | Entrypoint makes `WOL_CONFIG_DIR` writable for Apache and backs up `config.json` on start (keeps last 5 in `config_backups/` there) |

### 2.4 Frontend Changes

| Change | Details |
|---|---|
| JS/CSS extraction | JavaScript and CSS moved from inline `<script>`/`<style>` blocks to external `assets/app.js` and `assets/style.css` |
| PHP-to-JS bridge | Configuration passed via `window.WOL_CONFIG` JSON object instead of inline PHP variables |
| CSRF in AJAX | All state-changing AJAX calls include `X-CSRF-TOKEN` header; JS updates the local token from response after each operation |
| Accessibility | Added `<label>` elements with `visually-hidden` class for form inputs |
| Card-based layout | Hosts displayed as cards in a responsive CSS grid, replacing the old Bootstrap table |
| Theme system | Dark (default), Light, and Auto themes via CSS custom properties on `[data-theme]`; user-selectable in Settings |
| Settings panel | Slide-out sidebar with configurable options (theme, compact view, check interval, auto-refresh, defaults, toast duration, language) persisted to `localStorage` via `WolSettings` manager |
| Toast notifications | Slide-in toast system replaces Bootstrap alert bars; configurable duration |
| Add Host modal | Floating action button opens a modal form with 2-column grid layout; CIDR and port pre-filled from settings defaults |
| Floating save bar | Appears at bottom of screen when unsaved changes exist, replacing inline save/cancel buttons |
| Live status counter | Header displays "X online / Y total" updated after each host check |
| Animated status | Pulsing green dot for online, red for offline, amber for checking; CSS keyframe animations |
| Compact view | Toggle in settings switches from card grid to single-column list layout |
| Fonts | Switched from Varela Round to Outfit (display) + JetBrains Mono (data/code) via Google Fonts |

---

## 3. File-by-File Reference

### `index.php`
- Top: requires the auth and functions modules, initializes variables, reads the config path (`WOL_CONFIG_DIR`) and the rate limits from the environment (with defaults)
- AJAX operation routing (CONFIG.GET/SET/DOWNLOAD, HOST.CHECK, HOST.WAKEUP)
  - CONFIG.GET: JSON error handling with `JSON_THROW_ON_ERROR`
  - CONFIG.SET: Atomic writes (temp file + rename), CSRF rotation, new token in response
  - HOST.CHECK: Strict allowlist SSRF validation
  - HOST.WAKEUP: CSRF rotation, new token in response
- Security headers for HTML responses
- Then the full HTML page — header with stats counter, card grid container, floating add button, save bar, toast container, settings slide-out panel, Bootstrap modals (load config, import, export, add host), script templates, CDN includes

### `includes/auth.php`
- Session initialization
- `generateCsrfToken()` — creates/caches 32-byte hex token in `$_SESSION['csrf_token']`
- `validateCsrfToken($token)` — timing-safe comparison via `hash_equals()`
- `rotateCsrfToken()` — clears and regenerates the CSRF token; called after successful CONFIG.SET and HOST.WAKEUP
- HTTP Basic Auth — reads `WOL_USERNAME`/`WOL_PASSWORD` from env, returns 401 if invalid
- Last: generates the CSRF token on every request, stored as `$csrfToken`

### `includes/functions.php`
- `wakeOnLan($mac, $ip, $cidr, $port, &$debugOut)` — validates inputs, builds magic packet, sends via UDP socket
- `safeGet($data, $key, $default)` — safe array access
- `endWithErrorMessage($message)` — HTTP 500 with HTML-escaped message
- `endWithJsonResponse($responseData, $filename)` — JSON response with security headers, optional download
- `checkRateLimit($action, $maxRequests, $windowSecs)` — session-based sliding window rate limiter

### `assets/app.js`
- mini-i18n.js library (language switching)
- Bootstrap Choice jQuery plugin (modal dialog)
- `WolSettings` manager — localStorage-backed settings with defaults for theme, compact view, check interval, auto-refresh, default port/CIDR, toast duration, and language
- Main application:
  - Toast notification system (`showToast`) replacing old alert-based `showNotification`
  - Card rendering (`renderCard`) and grid sync (`syncCardsFromTable`). The hidden `#hostTable` is the source of truth that `getConfiguration()` saves; the cards mirror it
  - Live stats counter (`updateStats`) and empty state management
  - Host add/remove/wake with card animations
  - Settings panel open/close and two-way binding to `WolSettings`
  - Theme application (`applyTheme`) and compact view toggle (`applyCompact`)
  - Drag-and-drop card reordering via jQuery UI sortable (syncs back to hidden table)
  - Startup: loads saved settings, applies theme/compact/language, starts host status polling

### `tests/test_functions.php`
- Tests `safeGet()`, `generateCsrfToken()`, `validateCsrfToken()`, `rotateCsrfToken()`, `checkRateLimit()`, and `wakeOnLan()` validation
- The `wakeOnLan()` validation tests need the `sockets` extension (the Docker image has it)
- Run with: `php tests/test_functions.php`
- Exit code 0 on success, 1 on failure

---

## 4. Data Flow

```
Browser                         Server (index.php)
  |                                 |
  |-- GET ?aop=CONFIG.GET --------->|  Read config.json (JSON_THROW_ON_ERROR), return JSON
  |                                 |
  |-- POST ?aop=CONFIG.SET -------->|  Validate CSRF + rate limit + JSON structure
  |   Body: JSON array              |  Atomic write (temp file + rename)
  |   Header: X-CSRF-TOKEN         |  Rotate CSRF token, return new token in response
  |<-- {status, csrfToken} --------|  JS updates local token
  |                                 |
  |-- GET ?aop=HOST.CHECK&host=x -->|  Rate limit, strict allowlist validation
  |                                 |  fsockopen() ports 3389/22/80/443/5938
  |                                 |
  |-- POST ?aop=HOST.WAKEUP ------>|  Validate CSRF + rate limit
  |   Body: {mac, host, cidr, port}|  Build magic packet, socket_sendto() UDP
  |   Header: X-CSRF-TOKEN         |  Rotate CSRF token, return new token in response
  |<-- {info, csrfToken} ----------|  JS updates local token
```

---

## 5. Configuration & Environment

### Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `WOL_CONFIG_DIR` | Directory of `config.json` and `config_backups/` | `/data` in the image; unset = next to `index.php` |
| `WOL_USERNAME` | HTTP Basic Auth username | _(empty = auth disabled)_ |
| `WOL_PASSWORD` | HTTP Basic Auth password | _(empty = auth disabled)_ |
| `WOL_RATE_LIMIT_CONFIG_SET` | Max config saves per window | `10` |
| `WOL_RATE_LIMIT_HOST_CHECK` | Max host checks per window | `120` |
| `WOL_RATE_LIMIT_HOST_WAKEUP` | Max wake-up requests per window | `5` |
| `WOL_RATE_LIMIT_WINDOW_SECS` | Rate limit window in seconds | `60` |
| `WAKE_ON_LAN_PLUS_IMAGE` | Tag of `ghcr.io/phoen-ix/wake-on-lan_plus` to run (`latest`, `sha-<short>`, `X.Y.Z`) | `latest` |
| `CONTAINER_NAME` | Docker container name | `wake-on-lan_plus` |
| `HOST_PORT` | Host port mapping (no effect on the macvlan network) | `3880` |
| `CONTAINER_PORT` | Container port | `80` |

### Rate Limits

Rate limits are configurable via environment variables (see above; `docker-compose.yml` passes them through, empty = default). Defaults:

| Action | Limit | Window |
|---|---|---|
| CONFIG.SET | 10 requests | 60 seconds |
| HOST.CHECK | 120 requests | 60 seconds |
| HOST.WAKEUP | 5 requests | 60 seconds |

---

## 6. Dependencies

### Server-side
- PHP 8.x
- PHP extensions: `sockets`, `mbstring`
- Apache with `AllowOverride All` (for the `.htaccess` files)

### Client-side (CDN)
- Bootstrap 5.3.3
- Popper.js 2.11.8
- jQuery 3.6.0
- jQuery UI 1.12.1
- Font Awesome 5.15.4
- Google Fonts (Outfit, JetBrains Mono)

### Client-side (localStorage)
- `wol_settings` — JSON object storing user preferences (theme, compact, checkInterval, autoRefresh, defaultPort, defaultCidr, toastDuration, language)

---

## 7. Known Considerations

1. **CDN dependency** — The frontend relies on CDN-hosted libraries (with SRI hashes). No internet = no Bootstrap/jQuery. The docs tour serves the same pinned versions from `e2e/node_modules` (the exact versions are pinned in `e2e/package.json`).
2. **Session-based rate limiting** — Rate limits are per-session, not per-IP. A new session resets limits. Limits are now configurable via environment variables.
3. **No database** — All configuration is stored in a single `config.json` file. Concurrent writes are protected by atomic rename but there's no multi-user conflict resolution.
4. **macvlan networking** — Docker deployment requires macvlan network creation, which needs host network privileges and a dedicated IP. The `ports:` mapping does not apply there (open `http://<ipv4_address>/`), and the Docker host cannot reach its own macvlan containers.
5. **Legacy file** — The original `wake-on-lan_plus.php` monolith is kept in the repo for reference but blocked from web access. It can be safely deleted.
6. **Config backups** — The entrypoint creates timestamped backups in `$WOL_CONFIG_DIR/config_backups/` on container start (last 5 kept). With `docker-compose.yml` they land in `./volume/config/config_backups/`.
7. **Theme system** — Dark/Light/Auto modes selectable in the Settings panel. Auto follows `prefers-color-scheme`. The selected theme is persisted in localStorage.
8. **No CSP header** — Content-Security-Policy was removed because the app's inline PHP-to-JS bridge (`window.WOL_CONFIG`) and the template engine's use of `new Function()` require `unsafe-inline` and `unsafe-eval`, which negate CSP's value.
9. **Future improvements** — See `IMPROVEMENTS.md` for the roadmap.
10. **localStorage dependency** — Settings panel stores user preferences in `localStorage` under the key `wol_settings`. If localStorage is unavailable (e.g., private browsing in some browsers), settings fall back to defaults each page load.
11. **Never mount over the web root** — A mount over `/var/www/html/` hides the image's `.htaccess`. The config lives in `/data`; the README has the upgrade steps from the old layout (`./volume/config/` over `/var/www/html/`, the app code on top). `tests/test_functions.php` fails if `docker-compose.yml` mounts anything into `/var/www/html`.

---

## 8. How to Continue Development

### Running Tests
```bash
php tests/test_functions.php
```

### Docs screenshots
`scripts/docs-screenshots.sh` (after `npm ci` in `e2e/`) builds the image, runs it as `wake-on-lan_plus_docs` on
`127.0.0.1:25500`, runs the Playwright tour in `e2e/docs/` and writes `docs/screenshots/`. See README "Screenshots".

### Adding a New AJAX Operation
1. Add a new `elseif` block in `index.php` following the existing pattern
2. Add rate limiting and CSRF validation if the operation is state-changing
3. Add corresponding JavaScript in `assets/app.js`

### Modifying Security Settings
- Rate limits: Set via `WOL_RATE_LIMIT_*` environment variables, or adjust the defaults at the top of `index.php`
- CSRF: Logic in `includes/auth.php` — `generateCsrfToken()`, `validateCsrfToken()`, `rotateCsrfToken()`
- Auth: Controlled by environment variables, logic in `includes/auth.php`

### Building the Docker Image
```bash
docker build -t wake-on-lan_plus .
```

The published image is `ghcr.io/phoen-ix/wake-on-lan_plus` (linux/amd64 + linux/arm64). The `publish` job in
`.github/workflows/ci.yml` builds and pushes it after the `test` job passes: `latest` + `sha-<short>` from `master`,
`X.Y.Z` from a `vX.Y.Z` tag, never from pull requests. The old Docker Hub image `phoen9/wake-on-lan_plus` is no
longer updated.

### Improvements Roadmap
See `IMPROVEMENTS.md` for a prioritized list of improvement opportunities, organized by category with effort/impact ratings and code examples.
