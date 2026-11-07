import { request } from '@playwright/test'

import { AUTH, card, expect, HOSTS, inContainer, open, plain, seed, seedVia, session, test, toast } from './fixtures'

/* The AJAX operations' error states and limits, the server-side config file,
 * and the Basic Auth container's own settings. */

const SET = '/index.php?aop=CONFIG.SET'
const WAKE = '/index.php?aop=HOST.WAKEUP'
const CHECK = '/index.php?aop=HOST.CHECK'
// 127.0.0.1 inside the container: Apache on 80 only, every other port refuses at once.
const LOCAL = { mac: '02-5E-10-00-00-99', host: '127.0.0.1', cidr: '32', port: '9', comment: 'The container', up: null }

test.describe('CONFIG.SET', () => {
  test('a wrong or reused CSRF token is refused', async ({ baseURL }) => {
    const { api, token } = await session(baseURL!)
    expect((await api.post(SET, { headers: { 'X-CSRF-TOKEN': 'f'.repeat(64) }, data: [] })).status()).toBe(403)
    const ok = await api.post(SET, { headers: { 'X-CSRF-TOKEN': token }, data: plain(HOSTS) })
    expect(ok.status()).toBe(200)
    const { csrfToken } = await ok.json()
    expect(csrfToken).toMatch(/^[0-9a-f]{64}$/)
    const reused = await api.post(SET, { headers: { 'X-CSRF-TOKEN': token }, data: [] })
    expect(reused.status()).toBe(403)
    expect(await reused.text()).toBe('CSRF token validation failed.')
    expect((await api.post(SET, { headers: { 'X-CSRF-TOKEN': csrfToken }, data: [] })).status()).toBe(200)
    await api.dispose()
  })

  for (const [what, body, message] of [
    ['broken JSON', '[{', 'Invalid JSON data: Syntax error'],
    ['not a list', '{"mac": "02-5E-10-00-00-11", "host": "192.0.2.11"}', 'Invalid configuration format: expected an array.'],
    ['an entry without host', '[{"mac": "02-5E-10-00-00-11"}]', "Invalid configuration entry: each item must have at least &#039;mac&#039; and &#039;host&#039; fields."],
  ] as const) {
    test(`${what} is refused with a 500 and its reason; the saved config stays`, async ({ baseURL }) => {
      await seed(HOSTS, baseURL!)
      const { api, token } = await session(baseURL!)
      const res = await api.post(SET, { headers: { 'X-CSRF-TOKEN': token, 'content-type': 'application/json' }, data: Buffer.from(body) })
      expect(res.status()).toBe(500)
      expect(await res.text()).toBe(`Internal Server Error! ${message}`)
      expect(await (await api.get('/index.php?aop=CONFIG.GET')).json()).toEqual(plain(HOSTS))
      await api.dispose()
    })
  }

  test('the eleventh save within a minute is refused (limit 10)', async ({ baseURL }) => {
    const { api } = await session(baseURL!)
    for (let i = 1; i <= 10; i++) await seedVia(api, HOSTS)
    const html = await (await api.get('/')).text()
    const token = /"csrfToken":"([0-9a-f]{64})"/.exec(html)![1]
    const res = await api.post(SET, { headers: { 'X-CSRF-TOKEN': token }, data: plain(HOSTS) })
    expect(res.status()).toBe(429)
    expect(await res.text()).toBe('Too many requests. Please try again later.')
    await api.dispose()
  })

  test('an unwritable config directory: the save says so, nothing changes', async ({ page, baseURL, request }) => {
    await open(page, baseURL)
    await card(page, 'Gaming PC').getByRole('button', { name: 'Delete' }).click()
    inContainer('chmod 555 /data')
    try {
      await page.locator('#saveBar').getByRole('button', { name: 'Save' }).click()
      // Exactly the message: no PHP warning (with server paths) in front of it.
      await expect(toast(page).locator('.wol-toast__body')).toHaveText(
        'Internal Server Error! Cannot write configuration file. Please make sure the web server can write to the folder.',
      )
    } finally {
      inContainer('chmod 755 /data')
    }
    expect(await (await request.get('/index.php?aop=CONFIG.GET')).json()).toEqual(plain(HOSTS))
    expect(inContainer('ls /data').split('\n').filter((f) => f.includes('.tmp.'))).toEqual([])
  })

  test('a save that fails in the page shows the reason in a toast', async ({ page, baseURL }) => {
    await open(page, baseURL)
    await page.route(/aop=CONFIG\.SET/, (route) => route.fulfill({ status: 429, body: 'Too many requests. Please try again later.' }))
    await card(page, 'Gaming PC').getByRole('button', { name: 'Delete' }).click()
    await page.locator('#saveBar').getByRole('button', { name: 'Save' }).click()
    await expect(toast(page).filter({ hasText: 'Too many requests. Please try again later.' })).toHaveClass(/toast-danger/)
    await expect(page.locator('#saveBar')).toHaveClass(/is-visible/)
  })
})

test.describe('HOST.CHECK', () => {
  for (const [query, message] of [
    ['', 'Parameter host not set.'],
    ['&host=192.0.2.11;id', 'Invalid host parameter.'],
    [`&host=${'a'.repeat(254)}`, 'Invalid host parameter.'],
  ] as const) {
    test(`host "${query.slice(6, 30)}": ${message}`, async ({ request }) => {
      const res = await request.get(CHECK + query)
      expect(res.status()).toBe(500)
      expect(await res.text()).toBe(`Internal Server Error! ${message}`)
    })
  }

  test('a host that is not in the saved configuration is refused', async ({ baseURL, request }) => {
    await seed(HOSTS, baseURL!)
    const res = await request.get(`${CHECK}&host=127.0.0.1`)
    expect(res.status()).toBe(500)
    expect(await res.text()).toBe('Internal Server Error! Unknown host: only hosts of the saved configuration are checked.')
  })

  test('the 121st check within a minute is refused (limit 120), also from a fresh session', async ({ baseURL }) => {
    await seed([LOCAL], baseURL!)
    const { api } = await session(baseURL!)
    for (let i = 1; i <= 120; i++) expect((await api.get(`${CHECK}&host=127.0.0.1`)).status(), `check ${i}`).toBe(200)
    expect((await api.get(`${CHECK}&host=127.0.0.1`)).status()).toBe(429)
    await api.dispose()
    // The limit is per client IP: no cookie, no way around it.
    const fresh = await request.newContext({ baseURL })
    expect((await fresh.get(`${CHECK}&host=127.0.0.1`)).status()).toBe(429)
    await fresh.dispose()
  })

  test('a reachable host: isUp with the open port', async ({ baseURL, request }) => {
    await seed([LOCAL], baseURL!)
    const up = await (await request.get(`${CHECK}&host=127.0.0.1`)).json()
    expect(up).toMatchObject({ error: false, isUp: true, info: '80 (HTTP)' })
  })
})

test.describe('HOST.WAKEUP', () => {
  test('without a valid CSRF token: refused, nothing sent', async ({ baseURL }) => {
    const { api } = await session(baseURL!)
    const res = await api.post(WAKE, { headers: { 'X-CSRF-TOKEN': 'nope' }, data: plain(HOSTS)[0] })
    expect(res.status()).toBe(403)
    await api.dispose()
  })

  test('?debug=1 (WOL_DEBUG=1): the response carries the debug trace', async ({ page, baseURL }) => {
    await open(page, baseURL, { path: '/?debug=1' })
    const res = page.waitForResponse(/aop=HOST\.WAKEUP&debug=1/)
    await card(page, 'Office workstation').getByRole('button', { name: 'Wake' }).click()
    const body = await (await res).json()
    expect(body.DEBUG.join('\n')).toContain('$broadcastAddress = 192.0.2.255')
    await expect(toast(page)).toContainText('Magic packet has been sent for 02-5E-10-00-00-11')
  })

  test('the magic packet arrives: FF×6 + MAC×16 on the chosen UDP port', async ({ page, baseURL }) => {
    // A UDP sink in the container; CIDR 32 makes 127.0.0.1 its own broadcast address.
    inContainer(
      'rm -f /tmp/sink.*; nohup php -r \'$s = stream_socket_server("udp://127.0.0.1:40009", $no, $err, STREAM_SERVER_BIND); ' +
        'touch("/tmp/sink.ready"); $r = [$s]; $w = $e = null; ' +
        'if (stream_select($r, $w, $e, 60)) file_put_contents("/tmp/sink.hex", bin2hex(stream_socket_recvfrom($s, 2048)));\' ' +
        '>/dev/null 2>&1 &',
    )
    await expect.poll(() => inContainer('ls /tmp')).toContain('sink.ready')
    const sink = { mac: '02-5E-10-00-00-99', host: '127.0.0.1', cidr: '32', port: '40009', comment: 'UDP sink', up: null }
    await open(page, baseURL, { hosts: [sink] })
    await card(page, 'UDP sink').getByRole('button', { name: 'Wake' }).click()
    await expect(toast(page)).toContainText('Magic packet has been sent for 02-5E-10-00-00-99')
    await expect
      .poll(() => inContainer('cat /tmp/sink.hex 2>/dev/null || true'))
      .toBe('ff'.repeat(6) + '025e10000099'.repeat(16))
  })

  test('unknown or wrong-method operations: "Invalid value for aop!"', async ({ request }) => {
    for (const path of ['/index.php?aop=NOPE', '/index.php?aop=CONFIG.SET', '/index.php?aop=HOST.WAKEUP']) {
      const res = await request.get(path)
      expect(res.status(), path).toBe(500)
      expect(await res.text(), path).toBe('Internal Server Error! Invalid value for aop!')
    }
  })
})

test.describe('the config file', () => {
  test('a broken config.json: the page says so', async ({ page, baseURL }) => {
    await seed(HOSTS, baseURL!)
    inContainer('printf "[{" > /data/config.json')
    await page.goto('/')
    await expect(toast(page)).toContainText('Failed to parse configuration file: Syntax error')
    await expect(toast(page)).toHaveClass(/toast-danger/)
  })

  test('no config.json yet: an empty list, the empty state', async ({ page, request }) => {
    inContainer('rm -f /data/config.json')
    expect(await (await request.get('/index.php?aop=CONFIG.GET')).json()).toEqual([])
    await page.goto('/')
    await expect(page.getByText('No hosts configured')).toBeVisible()
  })

  test('the entrypoint backs config.json up on start and keeps the newest 5', async ({ baseURL }) => {
    await seed(HOSTS, baseURL!)
    inContainer(
      'rm -rf /data/config_backups && mkdir /data/config_backups && ' +
        'for i in 1 2 3 4 5 6; do touch -d "2020-01-0$i" /data/config_backups/config.json.2020010$i-000000; done',
    )
    // What the container runs on start, before Apache.
    inContainer('/entrypoint.sh true')
    const files = inContainer('ls /data/config_backups').trim().split('\n')
    expect(files).toHaveLength(5)
    expect(files).not.toContain('config.json.20200101-000000')
    expect(files).not.toContain('config.json.20200102-000000')
    const fresh = files.find((f) => !f.startsWith('config.json.2020'))!
    expect(JSON.parse(inContainer(`cat /data/config_backups/${fresh}`))).toEqual(plain(HOSTS))
    expect(inContainer('stat -c %U /data/config_backups').trim()).toBe('www-data')
  })
})

test.describe('the Basic Auth container (WOL_RATE_LIMIT_HOST_WAKEUP=1)', () => {
  test.use({ baseURL: AUTH.url, httpCredentials: { username: AUTH.username, password: AUTH.password } })

  test('?debug=1 without WOL_DEBUG=1: no debug trace', async ({ request }) => {
    expect(await (await request.get('/?debug=1')).text()).toContain('"isDebugEnabled":0')
  })

  test('signed in: the page works; the second wake within a minute is refused', async ({ page, request }) => {
    await seedVia(request, HOSTS)
    await page.goto('/')
    await expect(page.locator('#hostGrid .wol-card')).toHaveCount(HOSTS.length)
    const wake = card(page, 'Office workstation').getByRole('button', { name: 'Wake' })
    await wake.click()
    await expect(toast(page).filter({ hasText: 'Magic packet has been sent' })).toBeVisible()
    await wake.click()
    await expect(toast(page).filter({ hasText: 'Too many requests. Please try again later.' })).toBeVisible()
  })
})
