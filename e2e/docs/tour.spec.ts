import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type BrowserContext, type Locator, type Page, type Route } from '@playwright/test'

import { HOSTS, NEW_HOST, seed, type Host } from './seed'

/* The docs tour: one screenshot per screen and key state (the gallery is
 * docs/screenshots/README.md), taken against the demo hosts in ./seed.ts.
 * Run it through scripts/docs-screenshots.sh, or with
 * `-c playwright.docs.config.ts` against a running container.
 *
 * It is also a render check: every test asserts something screen-specific
 * before it shoots, and a page error fails the test. The regression checks at
 * the end take no screenshot.
 *
 * Determinism:
 * - The page loads Bootstrap, jQuery, Font Awesome and Google Fonts from CDNs.
 *   The tour serves the same pinned versions from e2e/node_modules and aborts
 *   (and fails on) every other request that leaves the app.
 * - HOST.CHECK is mocked: the demo hosts do not exist. The answers come from
 *   HOSTS[].up. Once every card has its status, the tour stops the status
 *   poller, so no card turns amber ("checking") again mid-shot.
 * - The magic packet (HOST.WAKEUP) is real; the demo hosts use RFC 5737
 *   documentation addresses, so it goes nowhere. */

const OUT = path.resolve(
  process.env.DOCS_SCREENSHOT_DIR ?? fileURLToPath(new URL('../../docs/screenshots', import.meta.url)),
)
mkdirSync(OUT, { recursive: true })
const MODULES = fileURLToPath(new URL('../node_modules', import.meta.url))

// The tour does not need the default 2 s between status checks.
const FAST = { checkInterval: 1000 }
// Toasts stay until the shot is taken.
const STICKY_TOASTS = { ...FAST, toastDuration: 0 }

let pageErrors: Error[] = []
let leaked: string[] = []

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors = []
  leaked = []
  page.on('pageerror', (e) => pageErrors.push(e))
  await serveCdnLocally(page.context(), new URL(baseURL!).host)
  await page.route(/[?&]aop=HOST\.CHECK/, mockHostCheck)
})

test.afterEach(async () => {
  expect(pageErrors.map((e) => e.message)).toEqual([])
  expect(leaked, 'requests the tour could not serve locally').toEqual([])
})

/* --- helpers -------------------------------------------------------------- */

const TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.svg': 'image/svg+xml',
}
// The page loads its CDN files with crossorigin="anonymous" (SRI), fonts are
// CORS requests anyway: both need the header.
const CORS = { 'access-control-allow-origin': '*' }

function fulfillFile(route: Route, file: string) {
  return route.fulfill({
    body: readFileSync(file),
    headers: { ...CORS, 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' },
  })
}

async function serveCdnLocally(ctx: BrowserContext, appHost: string) {
  // Registered first, so it only catches what the routes below do not.
  await ctx.route(
    (url) => url.host !== appHost && url.protocol !== 'data:',
    (route) => {
      leaked.push(route.request().url())
      return route.abort()
    },
  )
  // cdn.jsdelivr.net/npm/<pkg>@<version>/<file> -> node_modules/<pkg>/<file>,
  // only when the installed version is the one the page asks for.
  await ctx.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\//, (route) => {
    const m = /^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/([^?#]+)/.exec(route.request().url())
    const pkgDir = m && path.join(MODULES, m[1])
    const installed = pkgDir && JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version
    if (!m || installed !== m[2]) {
      leaked.push(`${route.request().url()} (installed: ${installed ?? 'none'})`)
      return route.abort()
    }
    return fulfillFile(route, path.join(pkgDir, m[3]))
  })
  // fonts.googleapis.com/css2?family=Outfit:wght@300;400… -> the @fontsource
  // packages' CSS for those weights, its font files served from a fake origin.
  await ctx.route(/^https:\/\/fonts\.googleapis\.com\/css2\?/, (route) => {
    const css = new URL(route.request().url()).searchParams
      .getAll('family')
      .flatMap((family) => {
        const [name, axes = 'wght@400'] = family.split(':')
        const pkg = name.toLowerCase().replace(/ /g, '-')
        return axes
          .replace('wght@', '')
          .split(';')
          .map((w) =>
            readFileSync(path.join(MODULES, '@fontsource', pkg, `${w}.css`), 'utf8').replaceAll(
              'url(./files/',
              `url(https://fonts.gstatic.com/fontsource/${pkg}/`,
            ),
          )
      })
      .join('\n')
    return route.fulfill({ body: css, headers: { ...CORS, 'content-type': 'text/css' } })
  })
  await ctx.route(/^https:\/\/fonts\.gstatic\.com\/fontsource\//, (route) => {
    const [pkg, file] = new URL(route.request().url()).pathname.split('/').slice(2)
    return fulfillFile(route, path.join(MODULES, '@fontsource', pkg, 'files', file))
  })
}

function mockHostCheck(route: Route) {
  const host = new URL(route.request().url()).searchParams.get('host')
  const up = [...HOSTS, NEW_HOST].find((h) => h.host === host)?.up
  return route.fulfill({
    json: up
      ? { error: false, isUp: true, info: up, errCode: '', errStr: '', errorPort: '' }
      : { error: false, isUp: false, errCode: 110, errStr: 'Connection timed out', errorPort: '5938' },
  })
}

/** Seed `hosts`, open the page with `settings` in localStorage and wait until
 * every card shows its status. */
async function open(
  page: Page,
  baseURL: string | undefined,
  { hosts = HOSTS, settings = FAST, settle: doSettle = true }: { hosts?: readonly Host[]; settings?: object; settle?: boolean } = {},
) {
  await seed(hosts, baseURL!)
  await page.addInitScript((s) => localStorage.setItem('wol_settings', JSON.stringify(s)), settings)
  await page.goto('/')
  await expect(page.locator('#statTotal')).toHaveText(String(hosts.length))
  if (doSettle) await settle(page, hosts.length)
}

/** Every card checked once (each starts amber), then the poller stopped. */
async function settle(page: Page, total: number) {
  const cards = page.locator('#hostGrid .wol-card')
  await expect(cards).toHaveCount(total)
  await expect(page.locator('#hostGrid .wol-card.is-checking')).toHaveCount(0, { timeout: 30_000 })
  // The next tick reads 0 and stops; it comes at most one interval (plus one
  // in-flight check) later.
  await page.evaluate(() => (window as unknown as { WolSettings: { set(k: string, v: unknown): void } }).WolSettings.set('checkInterval', 0))
  await page.waitForTimeout(2_500)
  await expect(page.locator('#hostGrid .wol-card.is-checking')).toHaveCount(0)
}

/** `clipTo`: crop below that element (+24 px) - the dark background's
 * gradient is what makes a full 1280x800 shot heavy. */
async function shoot(page: Page, name: string, opts: { clipTo?: string; toast?: boolean } = {}) {
  await page.evaluate(() => document.fonts.ready)
  if (!opts.toast) await expect(page.locator('#toastContainer .wol-toast')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('#ajaxLoader')).toBeHidden()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.move(0, 0)
  let clip: { x: number; y: number; width: number; height: number } | undefined
  if (opts.clipTo) {
    const box = await page.locator(opts.clipTo).boundingBox()
    if (!box) throw new Error(`[docs] ${opts.clipTo} is not on the page`)
    const { width, height } = page.viewportSize()!
    clip = { x: 0, y: 0, width, height: Math.min(height, Math.ceil(box.y + box.height) + 24) }
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled', caret: 'hide', clip })
}

const card = (page: Page, comment: string) => page.locator('#hostGrid .wol-card', { hasText: comment })

/** Resize a textarea (as its drag handle would) to its first `lines` lines,
 * or all of them, and scroll it to the top: no line cut in half. */
async function fitLines(textarea: Locator, lines?: number) {
  await textarea.evaluate((el: HTMLTextAreaElement, max) => {
    const cs = getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight)
    const [top, bottom] = [parseFloat(cs.paddingTop), parseFloat(cs.paddingBottom)]
    const total = Math.round((el.scrollHeight - top - bottom) / lh)
    const n = Math.min(max ?? total, total)
    const borders = el.offsetHeight - el.clientHeight
    el.style.height = `${borders + top + n * lh + (n === total ? bottom : 0)}px`
    el.scrollTop = 0
  }, lines ?? null)
}

async function openOptions(page: Page) {
  await page.locator('#dropdownOptions').click()
  await expect(page.locator('.dropdown-menu.show')).toBeVisible()
}

/* --- the host grid -------------------------------------------------------- */

test('hosts: grid (hero)', async ({ page, baseURL }) => {
  await open(page, baseURL)
  await expect(page.locator('#statOnline')).toHaveText('4')
  await expect(card(page, 'NAS (backups)')).toHaveClass(/is-online/)
  await expect(card(page, 'NAS (backups)')).toContainText('22 (SSH)')
  await expect(card(page, 'Gaming PC')).toHaveClass(/is-offline/)
  await shoot(page, 'hosts-grid')
})

test('hosts: grid, light theme', async ({ page, baseURL }) => {
  await open(page, baseURL, { settings: { ...FAST, theme: 'light' } })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await shoot(page, 'hosts-grid.light', { clipTo: '#hostGrid' })
})

test('hosts: grid, phone', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, baseURL)
  await expect(page.locator('#statOnline')).toHaveText('4')
  // The viewport, not the full page: the footer and the add button are fixed.
  await shoot(page, 'hosts-grid.mobile')
})

test('hosts: compact view', async ({ page, baseURL }) => {
  await open(page, baseURL, { settings: { ...FAST, compact: true } })
  await expect(page.locator('body')).toHaveClass(/view-compact/)
  await shoot(page, 'hosts-compact', { clipTo: '#hostGrid' })
})

test('hosts: empty', async ({ page, baseURL }) => {
  // A page load with no hosts saved (regression: it used to stay blank).
  await open(page, baseURL, { hosts: [] })
  await expect(page.locator('#emptyState')).toBeVisible()
  await expect(page.locator('#emptyState')).toContainText('No hosts configured')
  await shoot(page, 'hosts-empty')
})

test('hosts: wake a host', async ({ page, baseURL }) => {
  await open(page, baseURL, { settings: STICKY_TOASTS })
  await card(page, 'Office workstation').locator('.btnWakeUpHost').click()
  await expect(page.locator('#toastContainer .wol-toast.toast-success')).toContainText(
    'Magic packet has been sent for 02-5E-10-00-00-11',
  )
  await shoot(page, 'hosts-wake', { toast: true, clipTo: '#hostGrid' })
})

/* --- adding a host -------------------------------------------------------- */

test('add host: dialog', async ({ page, baseURL }) => {
  await open(page, baseURL)
  await page.locator('#fabAddHost').click()
  const modal = page.locator('#addHostModal')
  await expect(modal).toBeVisible()
  await expect(modal.locator('#cidr')).toHaveValue('24')
  await expect(modal.locator('#port')).toHaveValue('9')
  await modal.locator('#mac').fill(NEW_HOST.mac)
  await modal.locator('#host').fill(NEW_HOST.host)
  await modal.locator('#comment').fill(NEW_HOST.comment)
  await shoot(page, 'hosts-add')
})

test('add host: invalid input', async ({ page, baseURL }) => {
  await open(page, baseURL, { settings: STICKY_TOASTS })
  await page.locator('#fabAddHost').click()
  const modal = page.locator('#addHostModal')
  await expect(modal).toBeVisible()
  await modal.locator('#mac').fill('02-5E-10-00-00')
  await modal.locator('#port').fill('70000')
  await modal.locator('#addHost').click()
  const toast = page.locator('#toastContainer .wol-toast.toast-warning')
  await expect(toast).toContainText('Host is required.')
  await expect(toast).toContainText('Port must be 1-65535.')
  await expect(toast).toContainText('Invalid MAC address format.')
  await shoot(page, 'hosts-add-invalid', { toast: true })
})

test('add host: unsaved changes', async ({ page, baseURL }) => {
  // The new card needs the status poller, so settle only after adding it.
  await open(page, baseURL, { settle: false })
  await page.locator('#fabAddHost').click()
  const modal = page.locator('#addHostModal')
  await expect(modal).toBeVisible()
  await modal.locator('#mac').fill(NEW_HOST.mac.replaceAll('-', ''))
  await modal.locator('#host').fill(NEW_HOST.host)
  await modal.locator('#comment').fill(NEW_HOST.comment)
  await modal.locator('#addHost').click()
  await expect(modal).toBeHidden()
  await settle(page, HOSTS.length + 1)
  // The bare 12-digit MAC got its dashes.
  await expect(card(page, NEW_HOST.comment)).toContainText(NEW_HOST.mac)
  await expect(page.locator('#saveBar')).toHaveClass(/is-visible/)
  await expect(page.locator('#statOnline')).toHaveText('5')
  await shoot(page, 'hosts-unsaved')
})

/* --- header: settings and options ----------------------------------------- */

test('settings panel', async ({ page, baseURL }) => {
  // The defaults (2 s check interval) - this panel shows them. Tall enough
  // for the whole panel.
  await page.setViewportSize({ width: 1280, height: 1000 })
  await open(page, baseURL, { settings: {} })
  await page.locator('#openSettings').click()
  await expect(page.locator('#settingsPanel')).toHaveClass(/is-open/)
  await expect(page.locator('#settingInterval')).toHaveValue('2000')
  await expect(page.locator('#settingLanguage')).toBeInViewport({ ratio: 1 })
  await shoot(page, 'settings')
})

test('options menu', async ({ page, baseURL }) => {
  await open(page, baseURL)
  await openOptions(page)
  await expect(page.locator('#exportConfig')).toBeVisible()
  await shoot(page, 'options-menu', { clipTo: '#hostGrid' })
})

test('options: export configuration', async ({ page, baseURL }) => {
  await open(page, baseURL)
  await openOptions(page)
  await page.locator('#exportConfig').click()
  await expect(page.locator('#exportModal')).toBeVisible()
  await expect(page.locator('#exportJson')).toHaveValue(/"Office workstation"/)
  // The first host in full.
  await fitLines(page.locator('#exportJson'), 8)
  await shoot(page, 'config-export')
})

test('options: import configuration', async ({ page, baseURL }) => {
  await open(page, baseURL)
  await openOptions(page)
  await page.locator('#importConfig').click()
  const modal = page.locator('#importModal')
  await expect(modal).toBeVisible()
  const { up: _up, ...printer } = NEW_HOST
  await modal.locator('#importJson').fill(JSON.stringify([printer], null, 2))
  await fitLines(modal.locator('#importJson'))
  await shoot(page, 'config-import')
})

test('options: import configuration, invalid JSON', async ({ page, baseURL }) => {
  await open(page, baseURL)
  await openOptions(page)
  await page.locator('#importConfig').click()
  const modal = page.locator('#importModal')
  await expect(modal).toBeVisible()
  await modal.locator('#importJson').fill(`[{ "mac": "${NEW_HOST.mac}", `)
  await modal.locator('#importJsonConfig').click()
  await expect(modal.locator('#importJsonErrorContainer .alert-danger')).toContainText('SyntaxError')
  await shoot(page, 'config-import-invalid')
})

test('options: load configuration', async ({ page, baseURL }) => {
  await open(page, baseURL)
  await openOptions(page)
  await page.locator('#loadConfigFromServer').click()
  const modal = page.locator('#chooseLoadConfigModal')
  await expect(modal).toBeVisible()
  await expect(modal).toContainText('replace')
  await shoot(page, 'config-load')
})

/* --- regression checks (no screenshot) ------------------------------------ */

test('the .htaccess files apply (no Apache tweaks in the Dockerfile needed)', async ({ request }) => {
  for (const url of ['/config.json', '/includes/functions.php']) expect((await request.get(url)).status(), url).toBe(403)
})

test('a minute of 1 s status checks stays within the default HOST.CHECK limit', async ({ request }) => {
  // The poller checks one host per tick: up to 60 a minute at the 1 s interval.
  // Real checks (not the mock): the container's own Apache answers on port 80.
  for (let i = 1; i <= 60; i++) {
    expect((await request.get('/index.php?aop=HOST.CHECK&host=127.0.0.1')).status(), `check ${i}`).toBe(200)
  }
})

test('a failed wake shows the server message', async ({ page, baseURL }) => {
  const broken = { ...HOSTS[0], mac: '02-5E-10-00-00', comment: 'Broken MAC' }
  await open(page, baseURL, { hosts: [broken], settings: STICKY_TOASTS })
  await card(page, 'Broken MAC').locator('.btnWakeUpHost').click()
  await expect(page.locator('#toastContainer .wol-toast.toast-danger')).toContainText('Invalid MAC-address: 02-5E-10-00-00')
})
