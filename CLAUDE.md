@HANDOVER.md

## Commands

- Tests (need the `sockets` extension, so run them in the image):
  `docker build -t wol-test . && docker run --rm --entrypoint php -v "$PWD":/app:ro -w /app wol-test tests/test_functions.php`
- Lint: `php -l` on every PHP file (CI does it in the image, see `.github/workflows/ci.yml`).
- In the phoen-ix fleet: `fleet check wake-on-lan_plus` (runs the tests in the image).

## Invariants

- Never `docker compose up` in this checkout for testing: `docker-compose.yml` needs an
  external macvlan network and a real LAN address (`192.168.1.x` is a placeholder).
- On the fleet VM, never touch `phytotron-*` or `vib-*` containers.
- `#hostTable` (hidden) is the source of truth: `getConfiguration()` reads its rows and the
  cards mirror it. Every card change has to update both (see `syncCardsFromTable`, the
  sortable `stop` handler).
- `config.json` lives in the web root (`__DIR__`). The `docker-compose.yml` web-root mount
  hides the image's `.htaccess` (HANDOVER "Known Considerations" 11).
- `wake-on-lan_plus.php` is the pre-rewrite monolith: not in the image, blocked by
  `.htaccess`. Do not edit it; deleting it is the owner's call.
- i18n (`miniI18n` data at the end of `assets/app.js`) covers the options menu and the
  Add Host labels only. `en-US` has empty `c_replace_config`/`c_append_config`, which
  blank the Load Configuration dialog after switching back to English.
- Known UI gaps, left as they are (owner's call): a page load with zero hosts never shows
  the empty state (`updateEmptyState()` only runs after a card change). Server errors
  reach the toast as "Error 500: Internal Server Error" without the message. A 1s check
  interval exceeds the default HOST.CHECK rate limit (30/60 s).
- Commit style: plain imperative subject, no prefix. End with the Co-Authored-By trailer
  when an agent wrote it.
