import { AUTH, expect, HOSTS, seed, seedVia, test } from './fixtures'

/* Breadth: every route as every role. The roles: "open" (the image as
 * shipped, no Basic Auth), and on the Basic Auth container "guest" (no or
 * wrong credentials) and "user" (the right ones). The state-changing POSTs
 * (CONFIG.SET, HOST.WAKEUP) need a CSRF token; their own specs are in
 * api.spec.ts, here they only show who gets past Basic Auth. */

const GETS = [
  { path: '/', type: 'text/html' },
  { path: '/index.php', type: 'text/html' },
  { path: '/index.php?aop=CONFIG.GET', type: 'application/json' },
  { path: '/index.php?aop=CONFIG.DOWNLOAD', type: 'application/json' },
  { path: '/index.php?aop=HOST.CHECK&host=127.0.0.1', type: 'application/json' },
]
const POSTS = ['/index.php?aop=CONFIG.SET', '/index.php?aop=HOST.WAKEUP']
// Never served, whoever asks (.htaccess; /data is outside the web root).
const BLOCKED = [
  { path: '/config.json', status: 403 },
  { path: '/config.json.tmp.1', status: 403 },
  { path: '/includes/functions.php', status: 403 },
  { path: '/includes/auth.php', status: 403 },
  { path: '/wake-on-lan_plus.php', status: 403 },
  { path: '/data/config.json', status: 404 },
]

const ROLES = [
  { role: 'open', url: () => process.env.E2E_BASE_URL ?? 'http://127.0.0.1:25500', credentials: undefined, allowed: true },
  { role: 'guest', url: () => AUTH.url, credentials: undefined, allowed: false },
  { role: 'guest, wrong password', url: () => AUTH.url, credentials: { username: AUTH.username, password: 'wrong' }, allowed: false },
  { role: 'user', url: () => AUTH.url, credentials: { username: AUTH.username, password: AUTH.password }, allowed: true },
]

for (const { role, url, credentials, allowed } of ROLES) {
  test.describe(`sweep as ${role}`, () => {
    test.use({ baseURL: url(), httpCredentials: credentials })

    for (const { path, type } of GETS) {
      test(`GET ${path}`, async ({ request }) => {
        // HOST.CHECK checks only the saved hosts.
        if (allowed && path.includes('HOST.CHECK')) await seedVia(request, [{ ...HOSTS[0], host: '127.0.0.1' }])
        const res = await request.get(path)
        if (allowed) {
          expect(res.status()).toBe(200)
          expect(res.headers()['content-type']).toContain(type)
        } else {
          expect(res.status()).toBe(401)
          expect(res.headers()['www-authenticate']).toBe('Basic realm="Wake-on-LAN"')
        }
      })
    }

    for (const path of POSTS) {
      test(`POST ${path} without a CSRF token`, async ({ request }) => {
        // Past Basic Auth, the missing token is the next stop.
        expect((await request.post(path, { data: [] })).status()).toBe(allowed ? 403 : 401)
      })
    }

    for (const { path, status } of BLOCKED) {
      test(`GET ${path} is not served`, async ({ request }) => {
        // Apache answers before PHP's Basic Auth runs: the same for everyone.
        expect((await request.get(path)).status()).toBe(status)
      })
    }

    if (allowed) {
      test('the page renders, no 5xx, no page error', async ({ page, request }) => {
        const failed: string[] = []
        page.on('response', (r) => r.status() >= 500 && failed.push(`${r.status()} ${r.url()}`))
        await seedVia(request, HOSTS)
        await page.goto('/')
        await expect(page.locator('#hostGrid .wol-card')).toHaveCount(HOSTS.length)
        await expect(page.locator('#statOnline')).toHaveText('4')
        await expect(page).toHaveTitle('Wake On Lan')
        await expect(page.locator('.wol-header__title')).toHaveText('Wake On Lan')
        await expect(page.getByRole('button', { name: 'Add Host' })).toBeVisible()
        expect(failed).toEqual([])
      })
    } else {
      test('the page asks for credentials', async ({ page }) => {
        const res = await page.goto('/')
        expect(res?.status()).toBe(401)
        await expect(page.locator('body')).toHaveText('Authentication required.')
      })
    }
  })
}

test('the HTML page sends its security headers', async ({ request, baseURL }) => {
  await seed([], baseURL!)
  const headers = (await request.get('/')).headers()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
})
