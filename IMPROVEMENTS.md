# Wake-on-LAN Plus — Improvements Roadmap

A comprehensive catalog of findings, quick wins, and future improvement opportunities for the refactored Wake-on-LAN Plus project.

---

## Table of Contents

- [Quick Wins (Completed)](#quick-wins-completed)
- [Security](#security)
- [Code Quality](#code-quality)
- [Features](#features)
- [Docker & Deployment](#docker--deployment)
- [UX & Accessibility](#ux--accessibility)
- [Testing](#testing)
- [Ops & Monitoring](#ops--monitoring)

---

## Quick Wins (Completed)

The following low-effort, high-impact improvements have been implemented:

| # | Category | Improvement | Status |
|---|----------|-------------|--------|
| 1 | Security | CSRF token rotation after use | Done |
| 2 | Security | Content-Security-Policy header | Done |
| 3 | Security | Stricter host validation (SSRF) | Done |
| 4 | Security | MAC address regex anchoring | Done |
| 5 | Robustness | JSON error handling in CONFIG.GET | Done |
| 6 | Robustness | Atomic config file writes | Done |
| 7 | Docker | HEALTHCHECK instruction | Done |
| 8 | Docker | Config backup in entrypoint | Done |
| 9 | UX | Responsive table wrapper | Done |
| 10 | UX | Dark mode CSS | Done |
| 11 | Ops | Configurable rate limits via env | Done |

---

## Security

### Completed

#### CSRF Token Rotation After Use
**Priority:** High | **Effort:** Low | **Impact:** High

Tokens are now rotated after every successful `CONFIG.SET` and `HOST.WAKEUP` operation. The new token is returned in the JSON response and the JavaScript client updates its local copy automatically.

```php
// includes/auth.php
function rotateCsrfToken()
{
    unset($_SESSION['csrf_token']);
    return generateCsrfToken();
}
```

#### Content-Security-Policy Header
**Priority:** High | **Effort:** Low | **Impact:** High

A CSP header is now set for all HTML responses, restricting script/style/font/image sources to trusted origins only.

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data:; connect-src 'self'
```

#### Stricter Host Validation (SSRF Prevention)
**Priority:** High | **Effort:** Low | **Impact:** High

Replaced the weak blocklist regex with a strict allowlist: only alphanumeric characters, dots, hyphens, and colons (IPv6) are permitted, with a 253-character length limit.

```php
if (!preg_match('/^[a-zA-Z0-9.\-:]+$/', $host) || strlen($host) > 253) {
    endWithErrorMessage("Invalid host parameter.");
}
```

#### MAC Address Regex Fix
**Priority:** Medium | **Effort:** Low | **Impact:** Medium

Anchored the MAC regex with `^` and `$` and unified the character class to prevent partial matches.

```php
// Before: /([A-F0-9]{2}-){5}([0-9A-F]){2}/
// After:
if (!preg_match("/^([A-F0-9]{2}-){5}[A-F0-9]{2}$/", $mac) || strlen($mac) != 17) {
```

### Future

#### Subresource Integrity (SRI) Audit
**Priority:** Medium | **Effort:** Low | **Impact:** Medium

Verify all CDN `<script>` and `<link>` tags have correct `integrity` attributes. Currently present for Bootstrap, jQuery, and Popper but should be audited when dependencies are updated.

#### Rate Limiting by IP (Not Session)
**Priority:** Medium | **Effort:** Medium | **Impact:** High

Session-based rate limiting can be bypassed by clearing cookies. Consider adding IP-based rate limiting via a shared store (e.g., Redis, APCu, or file-based).

```php
// Example: IP-based rate limiter using APCu
function checkIpRateLimit($action, $max, $window) {
    $key = 'rate_' . $action . '_' . $_SERVER['REMOTE_ADDR'];
    $count = apcu_fetch($key) ?: 0;
    if ($count >= $max) return false;
    apcu_store($key, $count + 1, $window);
    return true;
}
```

#### Password Hashing for Stored Credentials
**Priority:** Medium | **Effort:** Medium | **Impact:** Medium

Currently, `WOL_USERNAME` and `WOL_PASSWORD` are compared directly. For production use, consider supporting pre-hashed passwords with `password_verify()`.

#### Session Cookie Hardening
**Priority:** Low | **Effort:** Low | **Impact:** Medium

Add `SameSite=Strict`, `Secure`, and `HttpOnly` flags to session cookies when running behind HTTPS.

```php
session_set_cookie_params([
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Strict',
]);
```

#### Permissions-Policy Header
**Priority:** Low | **Effort:** Low | **Impact:** Low

Add a `Permissions-Policy` header to disable unnecessary browser features.

```php
header("Permissions-Policy: camera=(), microphone=(), geolocation=()");
```

---

## Code Quality

### Completed

#### JSON Error Handling in CONFIG.GET
**Priority:** High | **Effort:** Low | **Impact:** Medium

`json_decode` in CONFIG.GET now uses `JSON_THROW_ON_ERROR` to catch corrupted config files gracefully.

#### Atomic Config File Writes
**Priority:** High | **Effort:** Low | **Impact:** High

Config saves now write to a temp file and use `rename()` for atomic swap, preventing corruption on concurrent writes or crashes.

### Future

#### Type Declarations
**Priority:** Low | **Effort:** Medium | **Impact:** Medium

Add PHP 8 type declarations (parameter types, return types) to all functions for better static analysis and IDE support.

```php
function safeGet(array $data, string $key, mixed $default): mixed
{
    return isset($data[$key]) ? $data[$key] : $default;
}
```

#### Static Analysis (PHPStan/Psalm)
**Priority:** Medium | **Effort:** Low | **Impact:** Medium

Add PHPStan or Psalm to CI. Current code is relatively clean but static analysis would catch type issues early.

```json
// composer.json
{
    "require-dev": {
        "phpstan/phpstan": "^1.0"
    }
}
```

#### Extract AJAX Handler into Router
**Priority:** Low | **Effort:** Medium | **Impact:** Medium

The `if/elseif` chain in `index.php` could be refactored into a simple router pattern as the number of operations grows.

```php
$routes = [
    'CONFIG.GET' => fn() => handleConfigGet($configFilename),
    'CONFIG.SET' => fn() => handleConfigSet($configFilename),
    // ...
];
```

#### Structured Logging
**Priority:** Low | **Effort:** Medium | **Impact:** Medium

Replace `die()` calls with a structured error handler that logs to stderr/syslog before responding. This would integrate better with Docker log collection.

---

## Features

### Future

#### WebSocket-Based Host Status
**Priority:** Low | **Effort:** High | **Impact:** High

Replace the polling-based host check (every 2s per host) with WebSocket push notifications to reduce server load. This would require a separate WebSocket server process (e.g., Ratchet/ReactPHP).

#### Multi-User Support
**Priority:** Low | **Effort:** High | **Impact:** Medium

Add user-specific configurations, so multiple users can manage their own host lists. Requires a database backend or per-user config files.

#### Host Groups / Tags
**Priority:** Low | **Effort:** Medium | **Impact:** Medium

Allow tagging hosts into groups (e.g., "Office", "Lab", "Home") for bulk wake and better organization.

#### Wake Schedule (Cron)
**Priority:** Low | **Effort:** High | **Impact:** Medium

Allow scheduling wake-up events at specific times. Would require a background process or integration with system cron.

#### Custom Port Check Configuration
**Priority:** Medium | **Effort:** Low | **Impact:** Medium

Allow users to configure which ports are checked per host, rather than the hardcoded list `[3389, 22, 80, 443, 5938]`.

```php
$HOST_CHECK_PORTS = json_decode(getenv('WOL_CHECK_PORTS') ?: '{"3389":"RDP","22":"SSH","80":"HTTP","443":"HTTPS","5938":"TeamViewer"}', true);
```

#### YAML/TOML Config Support
**Priority:** Low | **Effort:** Medium | **Impact:** Low

Support alternative config formats beyond JSON for human readability.

---

## Docker & Deployment

### Completed

#### HEALTHCHECK Instruction
**Priority:** High | **Effort:** Low | **Impact:** High

Added `HEALTHCHECK` to the Dockerfile using `curl` to verify Apache responsiveness.

#### Config Backup in Entrypoint
**Priority:** Medium | **Effort:** Low | **Impact:** Medium

The entrypoint now backs up `config.json` before starting Apache, retaining the 5 most recent backups.

### Future

#### Multi-Stage Build
**Priority:** Low | **Effort:** Low | **Impact:** Medium

Use a multi-stage build to reduce final image size by separating build dependencies from runtime.

```dockerfile
FROM php:8.3-apache AS runtime
# Only copy what's needed for production
```

#### Non-Root Container User
**Priority:** Medium | **Effort:** Medium | **Impact:** High

Run the container as a non-root user for defense-in-depth. Apache would need to be configured to listen on a high port (e.g., 8080).

#### Docker Compose Health Check Integration
**Priority:** Low | **Effort:** Low | **Impact:** Low

Update `docker-compose.yml` to use the Dockerfile HEALTHCHECK or add a compose-level healthcheck with `depends_on` conditions for orchestration.

#### Read-Only Root Filesystem
**Priority:** Low | **Effort:** Medium | **Impact:** Medium

Configure the container with `read_only: true` and mount only the required writable paths (`/var/www/html/config.json`, `/tmp`).

#### .dockerignore File
**Priority:** Low | **Effort:** Low | **Impact:** Low

Add a `.dockerignore` to exclude `tests/`, `.git/`, `README.md`, etc., from the Docker build context.

```
.git
tests/
README.md
LICENSE
*.png
.claude/
```

---

## UX & Accessibility

### Completed

#### Responsive Table Wrapper
**Priority:** Medium | **Effort:** Low | **Impact:** Medium

The host table is now wrapped in Bootstrap's `table-responsive` div for better mobile rendering.

#### Dark Mode CSS
**Priority:** Low | **Effort:** Low | **Impact:** Medium

Added `@media (prefers-color-scheme: dark)` block with Bootstrap-compatible overrides for backgrounds, text, forms, modals, and dropdowns.

### Future

#### Dark Mode Toggle Button
**Priority:** Low | **Effort:** Low | **Impact:** Medium

Add a manual dark/light mode toggle in addition to the `prefers-color-scheme` media query, with preference stored in localStorage.

#### Toast Notifications
**Priority:** Low | **Effort:** Medium | **Impact:** Medium

Replace the current alert-based notifications with Bootstrap 5 Toasts for a more modern, non-intrusive notification experience.

#### Keyboard Shortcuts
**Priority:** Low | **Effort:** Low | **Impact:** Low

Add keyboard shortcuts for common actions:
- `Ctrl+S` — Save configuration
- `Ctrl+N` — Focus new host form
- `Enter` in form — Add host

#### Accessibility Improvements
**Priority:** Medium | **Effort:** Medium | **Impact:** Medium

- Add ARIA labels to all interactive elements
- Ensure proper focus management in modals
- Add skip-to-content link
- Verify color contrast ratios in both themes

#### PWA Support
**Priority:** Low | **Effort:** Medium | **Impact:** Low

Add a service worker and manifest.json to enable Progressive Web App capabilities (offline cache, add-to-homescreen).

---

## Testing

### Future

#### PHPUnit Migration
**Priority:** Medium | **Effort:** Medium | **Impact:** High

Migrate from the custom test runner (`tests/test_functions.php`) to PHPUnit for better test organization, fixtures, mocking, and CI integration.

```json
// composer.json
{
    "require-dev": {
        "phpunit/phpunit": "^10.0"
    }
}
```

#### Integration Tests
**Priority:** Medium | **Effort:** High | **Impact:** High

Add integration tests that spin up the full PHP server and test the AJAX endpoints:
- CONFIG.GET returns valid JSON
- CONFIG.SET validates input and persists
- HOST.WAKEUP validates MAC and returns new CSRF token
- Rate limiting enforced correctly
- CSRF token rotation works end-to-end

#### JavaScript Tests
**Priority:** Low | **Effort:** High | **Impact:** Medium

Add frontend tests using Jest or similar for:
- Configuration rendering
- Input validation
- CSRF token update on response
- Notification display

#### CI/CD Pipeline
**Priority:** Medium | **Effort:** Medium | **Impact:** High

Set up GitHub Actions workflow:

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          extensions: sockets
      - run: php tests/test_functions.php
      - run: docker build -t wol-test .
```

#### Code Coverage
**Priority:** Low | **Effort:** Low | **Impact:** Medium

Add code coverage reporting (Xdebug + PHPUnit) to identify untested paths, particularly in `wakeOnLan()` success cases and edge cases.

---

## Ops & Monitoring

### Completed

#### Configurable Rate Limits via Environment
**Priority:** Medium | **Effort:** Low | **Impact:** Medium

Rate limit values are now configurable via environment variables:
- `WOL_RATE_LIMIT_CONFIG_SET` (default: 10)
- `WOL_RATE_LIMIT_HOST_CHECK` (default: 30)
- `WOL_RATE_LIMIT_HOST_WAKEUP` (default: 5)
- `WOL_RATE_LIMIT_WINDOW_SECS` (default: 60)

### Future

#### Prometheus Metrics Endpoint
**Priority:** Low | **Effort:** Medium | **Impact:** Medium

Expose a `/metrics` endpoint with counters for wake-up requests, host statuses, and error rates. Compatible with Prometheus/Grafana monitoring stacks.

#### Access Logging
**Priority:** Low | **Effort:** Low | **Impact:** Medium

Log all state-changing operations (config saves, wake-up commands) with timestamp, IP, and user agent to a dedicated log file or stderr.

```php
function auditLog($action, $details = '') {
    $entry = date('c') . ' ' . $_SERVER['REMOTE_ADDR'] . ' ' . $action . ' ' . $details;
    error_log($entry);
}
```

#### Backup Rotation via Cron
**Priority:** Low | **Effort:** Low | **Impact:** Low

Add optional cron-based config backup (in addition to the entrypoint backup) for long-running containers.

#### Environment Variable Documentation
**Priority:** Medium | **Effort:** Low | **Impact:** Medium

Document all supported environment variables in the README and `example.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `WOL_USERNAME` | _(empty)_ | HTTP Basic Auth username |
| `WOL_PASSWORD` | _(empty)_ | HTTP Basic Auth password |
| `WOL_RATE_LIMIT_CONFIG_SET` | `10` | Max config saves per window |
| `WOL_RATE_LIMIT_HOST_CHECK` | `30` | Max host checks per window |
| `WOL_RATE_LIMIT_HOST_WAKEUP` | `5` | Max wake-ups per window |
| `WOL_RATE_LIMIT_WINDOW_SECS` | `60` | Rate limit window in seconds |

---

## Summary

| Category | Completed | Planned | Total |
|----------|-----------|---------|-------|
| Security | 4 | 5 | 9 |
| Code Quality | 2 | 4 | 6 |
| Features | 0 | 6 | 6 |
| Docker | 2 | 4 | 6 |
| UX | 2 | 5 | 7 |
| Testing | 0 | 5 | 5 |
| Ops | 1 | 4 | 5 |
| **Total** | **11** | **33** | **44** |
