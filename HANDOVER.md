# Handover Document — wake-on-lan_plus (Refactored Edition)

## 1. Overview

This project is a security-hardened, modular rewrite of [phoen-ix/wake-on-lan_plus](https://github.com/phoen-ix/wake-on-lan_plus) — a PHP web application for sending Wake-on-LAN magic packets to hosts on a local network.

The **original** project was a single monolithic PHP file (`wake-on-lan_plus.php`, ~1622 lines) containing all backend logic, HTML, CSS, and JavaScript inline. This refactored version splits it into a clean modular structure and adds significant security hardening.

---

## 2. What Changed (Original vs. Refactored)

### 2.1 Architecture — Monolith to Modular

| Original | Refactored |
|---|---|
| `wake-on-lan_plus.php` (1622 lines, everything inline) | `index.php` (~477 lines) — entry point, AJAX routing, HTML |
| | `includes/auth.php` (~68 lines) — authentication, CSRF tokens, token rotation |
| | `includes/functions.php` (232 lines) — core WoL functions, helpers |
| | `assets/app.js` (~907 lines) — all client-side JavaScript |
| | `assets/style.css` (~120 lines) — all CSS (includes dark mode) |
| No tests | `tests/test_functions.php` (~172 lines) — unit tests |

The original monolith file is retained in the repo but blocked from web access via `.htaccess`.

### 2.2 Security Additions

These features did **not** exist in the original:

| Feature | Implementation | Files |
|---|---|---|
| **CSRF protection** | 32-byte random hex token stored in session, validated on CONFIG.SET and HOST.WAKEUP via `X-CSRF-TOKEN` header | `includes/auth.php`, `index.php`, `assets/app.js` |
| **CSRF token rotation** | Token is regenerated after every successful CONFIG.SET and HOST.WAKEUP; new token returned in JSON response and picked up by JS client | `includes/auth.php`, `index.php`, `assets/app.js` |
| **Rate limiting** | Session-based, per action, configurable via env vars (see Environment Variables) | `includes/functions.php`, `index.php` |
| **HTTP Basic Auth** | Optional, via `WOL_USERNAME`/`WOL_PASSWORD` env vars, timing-safe comparison | `includes/auth.php` |
| **SSRF prevention** | Strict allowlist on HOST.CHECK `host` param — only `[a-zA-Z0-9.\-:]` allowed, max 253 chars | `index.php:101-104` |
| **Security headers** | `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy` | `index.php:170-174`, `includes/functions.php:192-194` |
| **`.htaccess` rules** | Blocks direct access to `config.json`, the old monolith file, and the `includes/` directory | `.htaccess`, `includes/.htaccess` |
| **JSON validation** | CONFIG.SET validates that input is an array of objects with `mac` and `host` fields; CONFIG.GET uses `JSON_THROW_ON_ERROR` | `index.php:36-40`, `index.php:64-72` |
| **Atomic file writes** | Config saves write to a temp file then `rename()` for crash-safe atomic swap | `index.php:75-79` |
| **MAC regex fix** | Regex anchored with `^`/`$`, consistent `[A-F0-9]` character class to prevent partial matches | `includes/functions.php:40` |
| **POST for wakeup** | HOST.WAKEUP changed from GET to POST (prevents CSRF via URL) | `index.php:131`, `assets/app.js` |

### 2.3 Docker Changes

| Aspect | Original | Refactored |
|---|---|---|
| Base image | `ubuntu:jammy-20240212` + `ppa:ondrej/php` | `php:8.3-apache` (official, smaller) |
| File copy | Copies single `wake-on-lan_plus.php` as `index.php` | Copies `index.php`, `includes/`, `assets/`, `.htaccess` |
| Apache config | Default | Enables `mod_rewrite`, sets `AllowOverride All` |
| CMD | `apachectl -D FOREGROUND` | `apache2-foreground` (official entrypoint) |
| Auth support | None | Passes `WOL_USERNAME`/`WOL_PASSWORD` env vars |
| Volume mounts | Single `.php` file + config volume | `index.php`, `includes/`, `assets/` (all `:ro`) + config volume |
| HEALTHCHECK | None | `curl -f http://localhost/` every 30s with 5s timeout, 3 retries |
| Config backup | None | Entrypoint backs up `config.json` on start (keeps last 5 in `config_backups/`) |

### 2.4 Frontend Changes

| Change | Details |
|---|---|
| JS/CSS extraction | JavaScript and CSS moved from inline `<script>`/`<style>` blocks to external `assets/app.js` and `assets/style.css` |
| PHP-to-JS bridge | Configuration passed via `window.WOL_CONFIG` JSON object instead of inline PHP variables |
| CSRF in AJAX | All state-changing AJAX calls include `X-CSRF-TOKEN` header; JS updates the local token from response after each operation |
| Accessibility | Added `<label>` elements with `visually-hidden` class for form inputs |
| Responsive table | Host table wrapped in Bootstrap `table-responsive` div for mobile support |
| Dark mode | Automatic via `@media (prefers-color-scheme: dark)` with Bootstrap-compatible overrides for backgrounds, text, forms, modals, and dropdowns |

---

## 3. File-by-File Reference

### `index.php`
- **Lines 1-14**: Requires auth and functions modules, initializes variables
- **Lines 23-27**: Configurable rate limit variables from environment (with defaults)
- **Lines 32-168**: AJAX operation routing (CONFIG.GET/SET/DOWNLOAD, HOST.CHECK, HOST.WAKEUP)
  - CONFIG.GET: JSON error handling with `JSON_THROW_ON_ERROR`
  - CONFIG.SET: Atomic writes (temp file + rename), CSRF rotation, new token in response
  - HOST.CHECK: Strict allowlist SSRF validation
  - HOST.WAKEUP: CSRF rotation, new token in response
- **Lines 170-174**: Security headers for HTML responses
- **Lines 175-476**: Full HTML page — Bootstrap 5.3.3 layout, responsive table, modals, JS includes

### `includes/auth.php`
- **Lines 6-8**: Session initialization
- **Lines 15-21**: `generateCsrfToken()` — creates/caches 32-byte hex token in `$_SESSION['csrf_token']`
- **Lines 29-32**: `validateCsrfToken($token)` — timing-safe comparison via `hash_equals()`
- **Lines 40-44**: `rotateCsrfToken()` — clears and regenerates the CSRF token; called after successful CONFIG.SET and HOST.WAKEUP
- **Lines 50-65**: HTTP Basic Auth — reads `WOL_USERNAME`/`WOL_PASSWORD` from env, returns 401 if invalid
- **Line 67**: Generates CSRF token on every request, stored as `$csrfToken`

### `includes/functions.php`
- **Lines 17-138**: `wakeOnLan($mac, $ip, $cidr, $port, &$debugOut)` — validates inputs, builds magic packet, sends via UDP socket
- **Lines 148-151**: `safeGet($data, $key, $default)` — safe array access
- **Lines 158-162**: `endWithErrorMessage($message)` — HTTP 500 with HTML-escaped message
- **Lines 170-201**: `endWithJsonResponse($responseData, $filename)` — JSON response with security headers, optional download
- **Lines 211-231**: `checkRateLimit($action, $maxRequests, $windowSecs)` — session-based sliding window rate limiter

### `assets/app.js`
- **Lines 1-265**: mini-i18n.js library (language switching)
- **Lines 271-333**: Bootstrap Choice jQuery plugin (modal dialog)
- **Lines 340-905**: Main application — config management, host status polling, template rendering, input validation, drag-and-drop, i18n data

### `tests/test_functions.php`
- Tests `safeGet()`, `generateCsrfToken()`, `validateCsrfToken()`, `rotateCsrfToken()`, `checkRateLimit()`, and `wakeOnLan()` validation
- 28 tests total (27 pass, 1 pre-existing known issue with `safeGet` null handling)
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
| `WOL_USERNAME` | HTTP Basic Auth username | _(empty = auth disabled)_ |
| `WOL_PASSWORD` | HTTP Basic Auth password | _(empty = auth disabled)_ |
| `WOL_RATE_LIMIT_CONFIG_SET` | Max config saves per window | `10` |
| `WOL_RATE_LIMIT_HOST_CHECK` | Max host checks per window | `30` |
| `WOL_RATE_LIMIT_HOST_WAKEUP` | Max wake-up requests per window | `5` |
| `WOL_RATE_LIMIT_WINDOW_SECS` | Rate limit window in seconds | `60` |
| `WAKE_ON_LAN_PLUS_IMAGE` | Docker image tag | `latest` |
| `CONTAINER_NAME` | Docker container name | `wake-on-lan_plus` |
| `HOST_PORT` | Host port mapping | `3880` |
| `CONTAINER_PORT` | Container port | `80` |

### Rate Limits

Rate limits are configurable via environment variables (see above). Defaults:

| Action | Limit | Window |
|---|---|---|
| CONFIG.SET | 10 requests | 60 seconds |
| HOST.CHECK | 30 requests | 60 seconds |
| HOST.WAKEUP | 5 requests | 60 seconds |

---

## 6. Dependencies

### Server-side
- PHP 8.x
- PHP extensions: `sockets`, `mbstring`
- Apache with `mod_rewrite` and `AllowOverride All`

### Client-side (CDN)
- Bootstrap 5.3.3
- Popper.js 2.11.8
- jQuery 3.6.0
- jQuery UI 1.12.1
- Font Awesome 5.15.4
- Google Fonts (Varela Round)

---

## 7. Known Considerations

1. **CDN dependency** — The frontend relies on CDN-hosted libraries. No internet = no Bootstrap/jQuery. The CSP header is configured to allow these CDN origins.
2. **Session-based rate limiting** — Rate limits are per-session, not per-IP. A new session resets limits. Limits are now configurable via environment variables.
3. **No database** — All configuration is stored in a single `config.json` file. Concurrent writes are protected by atomic rename but there's no multi-user conflict resolution.
4. **macvlan networking** — Docker deployment requires macvlan network creation, which needs host network privileges and a dedicated IP.
5. **Legacy file** — The original `wake-on-lan_plus.php` monolith is kept in the repo for reference but blocked from web access. It can be safely deleted.
6. **Config backups** — The entrypoint creates timestamped backups in `config_backups/` on container start (last 5 kept). These are inside the container; map a volume to persist them.
7. **Dark mode** — Follows system preference via `prefers-color-scheme`. No manual toggle yet.
8. **No CSP header** — Content-Security-Policy was removed because the app's inline PHP-to-JS bridge (`window.WOL_CONFIG`) and the template engine's use of `new Function()` require `unsafe-inline` and `unsafe-eval`, which negate CSP's value.
9. **Future improvements** — See `IMPROVEMENTS.md` for a comprehensive roadmap of planned improvements across 7 categories.

---

## 8. How to Continue Development

### Running Tests
```bash
php tests/test_functions.php
```

### Adding a New AJAX Operation
1. Add a new `elseif` block in `index.php` following the existing pattern
2. Add rate limiting and CSRF validation if the operation is state-changing
3. Add corresponding JavaScript in `assets/app.js`

### Modifying Security Settings
- Rate limits: Set via `WOL_RATE_LIMIT_*` environment variables, or adjust defaults in `index.php:24-27`
- CSRF: Logic in `includes/auth.php` — `generateCsrfToken()`, `validateCsrfToken()`, `rotateCsrfToken()`
- Auth: Controlled by environment variables, logic in `includes/auth.php`

### Building the Docker Image
```bash
docker build -t wake-on-lan_plus .
```

### Improvements Roadmap
See `IMPROVEMENTS.md` for a prioritized list of 33 future improvement opportunities, organized by category with effort/impact ratings and code examples.
