# wake-on-lan_plus
Forked from [AndiSHFR/wake-on-lan.php](https://github.com/andishfr/wake-on-lan.php), maintained by [phoen-ix](https://github.com/phoen-ix/wake-on-lan_plus).

![Wake-On_Lan Screenshot](wake-on-lan_plus.png "wake-on-lan screenshot")

## What's New (Refactored Edition)

This version is a security-hardened, modular rewrite based on the 2024 release. Key changes:

### Architecture
  * Refactored from a single 1600-line monolith (`wake-on-lan_plus.php`) into a clean modular structure:
    - `index.php` — Entry point, AJAX routing, and HTML
    - `includes/auth.php` — Authentication and CSRF token management
    - `includes/functions.php` — Core WoL functions and utilities
    - `assets/app.js` — All client-side JavaScript
    - `assets/style.css` — All CSS styles
  * Unit test suite added (`tests/test_functions.php`)

### Security
  * **CSRF protection** on all state-changing operations (CONFIG.SET, HOST.WAKEUP) via `X-CSRF-TOKEN` header
  * **Session-based rate limiting** per action (CONFIG.SET: 10/60s, HOST.CHECK: 30/60s, HOST.WAKEUP: 5/60s)
  * **Optional HTTP Basic Authentication** via `WOL_USERNAME` and `WOL_PASSWORD` environment variables
  * **SSRF prevention** — input validation on the HOST.CHECK `host` parameter
  * **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`
  * **`.htaccess` protections** — blocks direct web access to `config.json` and the old monolith file
  * **Timing-safe comparisons** via `hash_equals()` for tokens and credentials
  * **JSON structure validation** on configuration saves
  * **File locking** (`LOCK_EX`) on config file writes
  * HOST.WAKEUP changed from GET to POST

### Docker
  * Switched from Ubuntu + PPAs to the official `php:8.3-apache` base image (smaller, simpler)
  * `.htaccess` / `mod_rewrite` support enabled in the container
  * Authentication environment variables passed through `docker-compose.yml`

### From the 2024 Release
  * PHP 8.3 compatibility
  * Value checks for MAC address, CIDR, and port before adding entries
  * Save and Cancel buttons appear when changes are made
  * Renamed "Tools" to "Options"
  * Bootstrap 5.3.3
  * TeamViewer port (5938) added to host status checks
  * Default values for CIDR (24) and port (9) if left empty

---

## Quick Start (Docker Compose)

1. Clone the repository
2. (Optional) Copy `example.env` to `.env` and adjust values
3. Create a macvlan network matching your LAN:

```bash
docker network create -d macvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.1 \
  -o parent=eth0 macvlan_network
```

4. Update the `ipv4_address` in `docker-compose.yml` to a free IP on your network
5. Start the container:

```bash
docker compose up -d
```

### Optional: Enable Authentication

Set credentials in your `.env` file or directly in `docker-compose.yml`:

```env
WOL_USERNAME=admin
WOL_PASSWORD=your_secure_password
```

Leave both empty to disable authentication.

---

## Requirements (Bare Metal)

  * PHP 8.x with the `sockets` and `mbstring` extensions enabled
  * Apache with `mod_rewrite` and `AllowOverride All` (for `.htaccess` support)
  * Internet connection for CDN includes (Bootstrap, jQuery, Font Awesome)
  * Web server must be allowed to write to `config.json`

## Installation (Bare Metal)

1. Clone the repository or download the zip file
2. Copy the project files to a directory on your web server
3. Ensure the web server can write to the directory (for `config.json`)
4. Navigate to the `index.php` URL in your browser

### Enabling the PHP Sockets Extension

  * Open your `php.ini` file
  * Find the line `;extension=sockets`
  * Remove the leading semicolon (`;`) to enable it
  * Reload your web server

---

## Project Structure

```
index.php                  Main entry point (AJAX routing + HTML UI)
includes/
  auth.php                 Authentication & CSRF token management
  functions.php            Core WoL functions & utilities
  .htaccess                Blocks direct web access to includes/
assets/
  app.js                   Client-side JavaScript application
  style.css                CSS styles
tests/
  test_functions.php       Unit tests (run: php tests/test_functions.php)
Dockerfile                 Docker image definition
docker-compose.yml         Docker Compose orchestration
entrypoint.sh              Docker entrypoint script
example.env                Environment variable template
.htaccess                  Protects config.json and legacy files
```

---

## Usage

### Adding a Host
Fill in the input fields at the bottom of the table and press the **+** button.

  * **MAC-Address** — Accepts `-` or `:` separators, or raw 12-character hex. Dash separators are added automatically if omitted.
  * **IP or Hostname** — Required for host status checks and broadcast address calculation.
  * **CIDR** — Subnet mask in CIDR notation (defaults to 24).
  * **Port** — UDP port for the magic packet (defaults to 9).
  * **Comment** — Optional description.

### Removing a Host
Click the trash can icon. The removed host's data is placed into the input fields so you can re-add it if needed.

### Saving
Click the green **Save** button or use _Options_ > _Save Configuration_. Save/Cancel buttons only appear after changes are made.

### Host Status
Hosts are continuously checked on ports 3389 (RDP), 22 (SSH), 80 (HTTP), 443 (HTTPS), and 5938 (TeamViewer). A thumbs-up/down icon indicates the result.

### Options Menu

| Option | Description |
|---|---|
| Download Configuration | Downloads `config.json` to your computer |
| Export Configuration | Shows JSON in a modal for manual copy |
| Import Configuration | Paste JSON to import hosts |
| Load Configuration | Reloads configuration from the server |
| Save Configuration | Saves current configuration to the server |

### Running Tests

```bash
php tests/test_functions.php
```

---

## Configuration Format

Stored as `config.json` — a JSON array of host objects:

```json
[
  {
    "mac": "AA-BB-CC-DD-EE-FF",
    "host": "192.168.1.100",
    "cidr": "24",
    "port": "9",
    "comment": "My Computer"
  }
]
```

---

## Internationalization

Language switching is available via flag icons in the footer:
  * English
  * German (Deutsch)
  * Spanish (Espanola)

---

## License
Published under the [MIT License](LICENSE).
