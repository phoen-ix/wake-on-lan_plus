# E2E coverage

Inventory of every user-facing feature of wake-on-lan_plus and the test that covers it.
Specs: `e2e/tests/*.spec.ts` (run: `scripts/e2e.sh`); the docs tour `e2e/docs/tour.spec.ts`
(run: `scripts/docs-screenshots.sh`) covers a few screens too.

Extraction (2026-10-31): the AJAX operations, every control/dialog/flag/choice in `index.php` and the
controls `assets/app.js` renders:

```sh
grep -oE '"[A-Z]+\.[A-Z]+" === \$ajaxOperation' index.php
grep -oE '<(button|select|input|textarea|a)\b[^>]*\bid="[^"]+"' index.php | grep -oE 'id="[^"]+"'
grep -oE 'class="modal fade" id="[^"]+"|data-lang-switch="[^"]+"|data-choice="[A-Z]+"' index.php
grep -oE "class=\"wol-card-btn [^ ]+ [a-zA-Z]+\"|class=\"wol-toast__close\"|handle: '[^']+'|'beforeunload'" assets/app.js
```

= 5 operations + 29 controls + 4 dialogs + 3 flags + 2 choices + 5 JS-rendered (wake, delete, toast
close, drag handle, leave prompt) = **48 items**. Below they are expanded into rows: each operation ×
role and error state, each control × the states it has. Roles: **open** (the image as shipped, no Basic
Auth), and with `WOL_USERNAME`/`WOL_PASSWORD` set **guest** (no or wrong credentials) and **user**.
There are no other roles, accounts, sign-up, mail or 2FA.

Total: **110 items** (45 route × role cells + 65 feature/state rows): **107 ✅, 3 ❌** (one each of
(a) hardware, (c) other layer, (d) cannot be driven; none (b) or (e)).

## Routes × roles (`sweep.spec.ts`, one parameterised sweep)

| Route | open | guest | guest, wrong password | user |
|---|---|---|---|---|
| `GET /` | ✅ `sweep as open › GET /` | ✅ `sweep as guest › GET /` | ✅ `sweep as guest, wrong password › GET /` | ✅ `sweep as user › GET /` |
| `GET /index.php` | ✅ `… › GET /index.php` | ✅ | ✅ | ✅ |
| `GET ?aop=CONFIG.GET` | ✅ `… › GET /index.php?aop=CONFIG.GET` | ✅ | ✅ | ✅ |
| `GET ?aop=CONFIG.DOWNLOAD` | ✅ `… › GET /index.php?aop=CONFIG.DOWNLOAD` | ✅ | ✅ | ✅ |
| `GET ?aop=HOST.CHECK` | ✅ `… › GET /index.php?aop=HOST.CHECK&host=127.0.0.1` | ✅ | ✅ | ✅ |
| `POST ?aop=CONFIG.SET` (no token: 403 past auth) | ✅ `… › POST /index.php?aop=CONFIG.SET without a CSRF token` | ✅ | ✅ | ✅ |
| `POST ?aop=HOST.WAKEUP` (no token: 403 past auth) | ✅ `… › POST /index.php?aop=HOST.WAKEUP without a CSRF token` | ✅ | ✅ | ✅ |
| the page renders (heading, Add Host, no 5xx, no page error) / asks for credentials | ✅ `… › the page renders, no 5xx, no page error` | ✅ `… › the page asks for credentials` | ✅ `… › the page asks for credentials` | ✅ `… › the page renders, no 5xx, no page error` |
| `/config.json`, `/config.json.tmp.*` (403) | ✅ `… › GET /config.json is not served`, `… /config.json.tmp.1 …` | ✅ | ✅ | ✅ |
| `/includes/*.php` (403) | ✅ `… › GET /includes/functions.php is not served`, `… auth.php …` | ✅ | ✅ | ✅ |
| `/wake-on-lan_plus.php`, `/data/config.json` (404) | ✅ `… › GET /wake-on-lan_plus.php is not served`, `… /data/config.json …` | ✅ | ✅ | ✅ |
| security headers on the HTML page | ✅ `sweep.spec.ts › the HTML page sends its security headers` | — | — | — |

"…" = the same test title under each role's `sweep as <role>` describe block.

## Host grid and status (`hosts.spec.ts`)

| Feature / state | Test |
|---|---|
| cards from the saved config, online (open port) / offline, header counts | ✅ `hosts.spec.ts › status › cards show online with the open port, or offline; the header counts them` |
| status poller, real HOST.CHECK (no mock) | ✅ `hosts.spec.ts › status › a real check: the container itself answers on port 80` |
| status poller, HOST.CHECK fails → offline | ✅ `hosts.spec.ts › status › a failing check marks the card offline` |
| card **Wake** button → success toast; twice (CSRF token rotation) | ✅ `hosts.spec.ts › wake › wake two hosts in a row: both packets sent (the CSRF token rotates)` |
| wake: server error message in the toast (invalid MAC) | ✅ `tour.spec.ts › a failed wake shows the server message` |
| wake: unresolvable hostname | ✅ `hosts.spec.ts › wake › an unresolvable hostname shows the server message` |
| wake: rate limit (5/min) → toast | ✅ `hosts.spec.ts › wake › the sixth wake within a minute is refused (HOST.WAKEUP limit 5)` |
| wake: the magic packet reaching a real NIC | ❌ (a) needs a sleeping machine on a real LAN (the suite's hosts are RFC 5737 addresses; `wakeOnLan()` packet building and validation: `tests/test_functions.php`, section wakeOnLan) |
| empty state on page load | ✅ `tour.spec.ts › hosts: empty`, `api.spec.ts › the config file › no config.json yet: an empty list, the empty state` |
| empty state after removing the last host | ✅ `hosts.spec.ts › remove, reorder, save, cancel › removing the last host shows the empty state` |
| card **Delete** → card gone, Add Host form holds the removed host | ✅ `hosts.spec.ts › remove, reorder, save, cancel › remove: the Add Host form holds the removed host for a re-add; save: gone on the server` |
| two deletes in quick succession / double click on Delete | ✅ `… › deleting two hosts in quick succession removes exactly those two`, `… › a double click on Delete removes that one host` |
| drag handle (card info): reorder sideways in the grid / down in the compact list, saved order | ✅ `… › grid: drag a card to another place, save: the server keeps the new order`, `… › compact list: drag a card to another place, …` |
| save bar **Save** | ✅ `hosts.spec.ts › add host › add, save: the host is on the server and still there after a reload` (+ every `save()` caller) |
| save bar **Cancel** | ✅ `… › cancel throws the unsaved changes away` |
| save failure (429/500) → toast, bar stays | ✅ `api.spec.ts › CONFIG.SET › a save that fails in the page shows the reason in a toast` |
| leave prompt (`beforeunload`) with / without unsaved changes | ✅ `… › leaving with unsaved changes asks first`, `… › leaving without changes does not ask` |
| comment with `'` and HTML: shown as text, wake/save work, no script | ✅ `hosts.spec.ts › odd input › a comment with an apostrophe and HTML: …` |
| toast close button | ✅ `hosts.spec.ts › page chrome › a toast closes with its close button` |
| sockets-missing warning toast | ✅ `hosts.spec.ts › page chrome › without the sockets extension the page warns, and the warning stays` (page HTML rewritten: the image always has sockets) |
| title link (reload), GitHub footer link | ✅ `hosts.spec.ts › page chrome › the title reloads the page; the footer links to GitHub` (href only: GitHub is external) |
| phone layout (390 px): buttons reachable, + clear of the save bar | ✅ `tour.spec.ts › layout: on a phone, …`, `… (compact) …`, `layout: the + button stays clear of the save bar` |

## Add Host dialog (`hosts.spec.ts › add host`)

| Feature / state | Test |
|---|---|
| **+** opens it, CIDR/port prefilled from the settings | ✅ `… › empty CIDR and port take the defaults from Settings; a MAC with colons is kept`, `tour.spec.ts › add host: dialog` |
| `#mac` required / invalid format | ✅ `… › mac "": "MAC address is required.", nothing added`, `… › mac "02-5E-10-00-00-4G": "Invalid MAC address format.", …` |
| `#host` required | ✅ `… › host "": "Host is required.", nothing added` |
| `#cidr` not numeric / out of range | ✅ `… › cidr "abc": …`, `… › cidr "33": …` |
| `#port` not numeric / out of range | ✅ `… › port "x": …`, `… › port "0": …` |
| `#comment`, empty CIDR/port → defaults, MAC with colons kept | ✅ `… › empty CIDR and port take the defaults from Settings; a MAC with colons is kept` |
| 12-digit MAC gets dashes | ✅ `tour.spec.ts › add host: unsaved changes` |
| **Add Host** → card + save bar → saved | ✅ `… › add, save: the host is on the server and still there after a reload` |
| **Cancel**, open again | ✅ `… › cancel closes the dialog and adds nothing; it opens again cleanly` |

## Options menu (`config.spec.ts`)

| Feature / state | Test |
|---|---|
| **Options** button opens the menu | ✅ every `openOptions()` caller, e.g. `config.spec.ts › export: …` |
| **Download Configuration** (file name, content) | ✅ `config.spec.ts › download: the saved file, named wake-on-lan-<date>-<time>.json` |
| **Export Configuration** dialog (page state incl. unsaved), Close | ✅ `config.spec.ts › export: the page as it is, unsaved changes included` |
| **Import Configuration**: append, save | ✅ `config.spec.ts › import appends to the page; save stores it` |
| import with **Overwrite existing configuration** | ✅ `config.spec.ts › import with "Overwrite existing configuration" replaces the page` |
| import: broken JSON / not a list / `null` / host without MAC | ✅ `config.spec.ts › import of broken JSON: …`, `… of not a list: …`, `… of null: …`, `… of a host without MAC: …` |
| **Load Configuration** dialog: Replace Existing / Append To Existing / Cancel | ✅ `config.spec.ts › load configuration › replace: …`, `… › append: …`, `… › cancel: nothing changes` |
| **Save Configuration** (only while dirty) | ✅ `config.spec.ts › "Save Configuration" in the menu: only with unsaved changes, and it saves` |

## Settings panel and language (`settings.spec.ts`)

| Feature / state | Test |
|---|---|
| **Settings** button, close X, click beside the panel | ✅ `settings.spec.ts › the panel opens from the header and closes with its X or a click beside it` |
| Theme Dark / Light / Auto (follows the system), kept after reload | ✅ `settings.spec.ts › theme: light and dark stay after a reload; auto follows the system` |
| Compact view | ✅ `settings.spec.ts › compact view: a list, also after a reload`, `tour.spec.ts › hosts: compact view` |
| Check interval, "Disabled" | ✅ `settings.spec.ts › check interval "Disabled": no status checks; another interval starts them again` |
| Auto-refresh off | ✅ `settings.spec.ts › auto-refresh off: the page does not load the hosts until "Load Configuration"` |
| Default port / Default CIDR, out-of-range values ignored | ✅ `settings.spec.ts › default port and CIDR fill the Add Host dialog; an out-of-range value is not stored` |
| Toast duration 3 s / Persistent | ✅ `settings.spec.ts › toast duration › 3 seconds: …`, `… › persistent: a toast stays` |
| Display language (de-DE, es-ES), kept after reload | ✅ `settings.spec.ts › language › Settings › Display language: German and Spanish, kept after a reload` |
| footer flags de / en / es, kept like the setting | ✅ `settings.spec.ts › language › the footer flags switch the language, and the choice is kept like the setting` |
| Load Configuration text back in English | ✅ `tour.spec.ts › i18n: German labels, and the Load Configuration dialog back in English` |

## AJAX error states, limits, config file (`api.spec.ts`)

| Feature / state | Test |
|---|---|
| CONFIG.SET: wrong / reused CSRF token (403), rotated token works | ✅ `api.spec.ts › CONFIG.SET › a wrong or reused CSRF token is refused` |
| CONFIG.SET: broken JSON / not a list / entry without host (500 + reason, file kept) | ✅ `api.spec.ts › CONFIG.SET › broken JSON is refused …`, `not a list …`, `an entry without host …` |
| CONFIG.SET: rate limit 10/min (429) | ✅ `api.spec.ts › CONFIG.SET › the eleventh save within a minute is refused (limit 10)` |
| CONFIG.SET: config dir not writable (500 + reason, file kept) | ✅ `api.spec.ts › CONFIG.SET › an unwritable config directory: the save says so, nothing changes` |
| HOST.CHECK: missing / invalid / too long host (500) | ✅ `api.spec.ts › HOST.CHECK › host "": …`, `host "=192.0.2.11;id": …`, `host "=aaaa…": …` |
| HOST.CHECK: rate limit 120/min (429), a minute at 1 s within it | ✅ `api.spec.ts › HOST.CHECK › the 121st check within a minute is refused (limit 120)`, `tour.spec.ts › a minute of 1 s status checks stays within the default HOST.CHECK limit` |
| HOST.CHECK: reachable host (isUp + port) | ✅ `api.spec.ts › HOST.CHECK › a reachable host: isUp with the open port` |
| HOST.WAKEUP: bad CSRF token (403) | ✅ `api.spec.ts › HOST.WAKEUP › without a valid CSRF token: refused, nothing sent` |
| HOST.WAKEUP: CIDR/port out of range | ❌ (c) `tests/test_functions.php` (wakeOnLan: "Rejects CIDR > 32", "Rejects negative CIDR", "Rejects port > 65535"); the page's own form refuses them first (add host rows) |
| `?debug=1` (debug trace in the response) | ✅ `api.spec.ts › HOST.WAKEUP › ?debug=1: the response carries the debug trace` |
| unknown / wrong-method `aop` (500) | ✅ `api.spec.ts › HOST.WAKEUP › unknown or wrong-method operations: "Invalid value for aop!"` |
| broken `config.json` → error toast | ✅ `api.spec.ts › the config file › a broken config.json: the page says so` |
| no `config.json` → empty list | ✅ `api.spec.ts › the config file › no config.json yet: an empty list, the empty state` |
| entrypoint: backup on start, newest 5 kept, owned by www-data | ✅ `api.spec.ts › the config file › the entrypoint backs config.json up on start and keeps the newest 5` |
| `WOL_RATE_LIMIT_*` env override (HOST.WAKEUP=1) with Basic Auth signed in | ✅ `api.spec.ts › the Basic Auth container (WOL_RATE_LIMIT_HOST_WAKEUP=1) › signed in: the page works; the second wake within a minute is refused` |
| Basic Auth browser prompt | ❌ (d) a native browser dialog; the 401 + `WWW-Authenticate` behind it is in the sweep (guest rows), the signed-in page via `httpCredentials` |
