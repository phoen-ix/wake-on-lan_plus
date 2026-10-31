import {
  card,
  cards,
  expect,
  HOSTS,
  names,
  NEW_HOST,
  open,
  plain,
  save,
  savedConfig,
  test,
  toast,
  type Host,
} from './fixtures'

/* The host grid: status, wake, add, remove, reorder, save and cancel. */

const addDialog = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Add Host' })

async function openAddDialog(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Add Host' }).click()
  await expect(addDialog(page)).toBeVisible()
  return addDialog(page)
}

test.describe('status', () => {
  test('cards show online with the open port, or offline; the header counts them', async ({ page, baseURL }) => {
    await open(page, baseURL)
    await expect(page.locator('#statOnline')).toHaveText('4')
    await expect(card(page, 'NAS (backups)')).toHaveClass(/is-online/)
    await expect(card(page, 'NAS (backups)')).toContainText('22 (SSH)')
    await expect(card(page, 'Gaming PC')).toHaveClass(/is-offline/)
    await expect(card(page, 'Lab test bench')).toHaveClass(/is-offline/)
  })

  test('a real check: the container itself answers on port 80', async ({ page, baseURL }) => {
    await page.route(/[?&]aop=HOST\.CHECK/, (route) => route.continue())
    await open(page, baseURL, { hosts: [{ ...HOSTS[0], host: '127.0.0.1', comment: 'This container' }] })
    await expect(card(page, 'This container')).toHaveClass(/is-online/)
    await expect(card(page, 'This container')).toContainText('80 (HTTP)')
  })

  test('a failing check marks the card offline', async ({ page, baseURL }) => {
    await page.route(/[?&]aop=HOST\.CHECK/, (route) => route.fulfill({ status: 500, body: 'Internal Server Error! Invalid host parameter.' }))
    await open(page, baseURL, { hosts: HOSTS.slice(0, 1) })
    await expect(cards(page).first()).toHaveClass(/is-offline/)
    await expect(page.locator('#statOnline')).toHaveText('0')
  })
})

test.describe('wake', () => {
  test('wake two hosts in a row: both packets sent (the CSRF token rotates)', async ({ page, baseURL }) => {
    await open(page, baseURL)
    for (const h of HOSTS.slice(0, 2)) {
      await card(page, h.comment).getByRole('button', { name: 'Wake' }).click()
      await expect(toast(page).filter({ hasText: `Magic packet has been sent for ${h.mac}` })).toHaveClass(/toast-success/)
    }
  })

  test('an unresolvable hostname shows the server message', async ({ page, baseURL }) => {
    await open(page, baseURL, { hosts: [{ ...HOSTS[0], host: 'no-such-host.invalid', comment: 'Gone' }] })
    await card(page, 'Gone').getByRole('button', { name: 'Wake' }).click()
    await expect(toast(page)).toContainText('Cannot resolve hostname "no-such-host.invalid"')
    await expect(toast(page)).toHaveClass(/toast-danger/)
  })

  test('the sixth wake within a minute is refused (HOST.WAKEUP limit 5)', async ({ page, baseURL }) => {
    await open(page, baseURL, { settings: { toastDuration: 0 } })
    const wake = card(page, 'Office workstation').getByRole('button', { name: 'Wake' })
    for (let i = 1; i <= 5; i++) {
      await wake.click()
      await expect(toast(page).filter({ hasText: 'Magic packet has been sent' })).toHaveCount(i)
    }
    await wake.click()
    await expect(toast(page).filter({ hasText: 'Too many requests. Please try again later.' })).toHaveClass(/toast-danger/)
  })
})

test.describe('add host', () => {
  for (const [field, value, message] of [
    ['mac', '', 'MAC address is required.'],
    ['host', '', 'Host is required.'],
    ['cidr', 'abc', 'CIDR must be numeric.'],
    ['cidr', '33', 'CIDR must be 0-32.'],
    ['port', 'x', 'Port must be numeric.'],
    ['port', '0', 'Port must be 1-65535.'],
    ['mac', '02-5E-10-00-00-4G', 'Invalid MAC address format.'],
  ] as const) {
    test(`${field} "${value}": "${message}", nothing added`, async ({ page, baseURL }) => {
      await open(page, baseURL)
      const dialog = await openAddDialog(page)
      const valid = { mac: NEW_HOST.mac, host: NEW_HOST.host, cidr: '24', port: '9' }
      for (const [k, v] of Object.entries({ ...valid, [field]: value })) await dialog.locator(`#${k}`).fill(v)
      await dialog.getByRole('button', { name: 'Add Host' }).click()
      await expect(toast(page).filter({ hasText: message })).toHaveClass(/toast-warning/)
      await expect(dialog).toBeVisible()
      await expect(cards(page)).toHaveCount(HOSTS.length)
    })
  }

  test('empty CIDR and port take the defaults from Settings; a MAC with colons is kept', async ({ page, baseURL }) => {
    await open(page, baseURL, { settings: { defaultCidr: 16, defaultPort: 7 } })
    const dialog = await openAddDialog(page)
    await expect(dialog.getByLabel('Subnet CIDR')).toHaveValue('16')
    await expect(dialog.getByLabel('Port')).toHaveValue('7')
    await dialog.getByLabel('MAC Address').fill('02:5E:10:00:00:41')
    await dialog.getByLabel('IP or Hostname').fill('192.0.2.41')
    await dialog.getByLabel('Subnet CIDR').fill('')
    await dialog.getByLabel('Port').fill('')
    await dialog.getByLabel('Comment').fill('Colon MAC')
    await dialog.getByRole('button', { name: 'Add Host' }).click()
    await expect(dialog).toBeHidden()
    const added = card(page, 'Colon MAC')
    await expect(added).toContainText('02:5E:10:00:00:41')
    await expect(added).toContainText('/16')
    await expect(added).toContainText('Port 7')
  })

  test('cancel closes the dialog and adds nothing; it opens again cleanly', async ({ page, baseURL }) => {
    await open(page, baseURL)
    for (let i = 0; i < 2; i++) {
      const dialog = await openAddDialog(page)
      await dialog.getByLabel('MAC Address').fill(NEW_HOST.mac)
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toBeHidden()
    }
    await expect(page.locator('.modal-backdrop')).toHaveCount(0)
    await expect(cards(page)).toHaveCount(HOSTS.length)
    await expect(page.locator('#saveBar')).not.toHaveClass(/is-visible/)
  })

  test('add, save: the host is on the server and still there after a reload', async ({ page, baseURL, request }) => {
    await open(page, baseURL)
    const dialog = await openAddDialog(page)
    await dialog.getByLabel('MAC Address').fill(NEW_HOST.mac)
    await dialog.getByLabel('IP or Hostname').fill(NEW_HOST.host)
    await dialog.getByLabel('Comment').fill(NEW_HOST.comment)
    await dialog.getByRole('button', { name: 'Add Host' }).click()
    await expect(page.locator('#saveBar')).toHaveClass(/is-visible/)
    await save(page)
    // The dialog stores CIDR and port as numbers.
    const { mac, host, comment } = NEW_HOST
    expect(await savedConfig(request)).toEqual([...plain(HOSTS), { mac, host, cidr: 24, port: 9, comment }])
    await page.reload()
    await expect(cards(page)).toHaveCount(HOSTS.length + 1)
    await expect(card(page, NEW_HOST.comment)).toBeVisible()
  })
})

test.describe('remove, reorder, save, cancel', () => {
  test('remove: the Add Host form holds the removed host for a re-add; save: gone on the server', async ({ page, baseURL, request }) => {
    await open(page, baseURL)
    await card(page, 'Gaming PC').getByRole('button', { name: 'Delete' }).click()
    await expect(cards(page)).toHaveCount(HOSTS.length - 1)
    await expect(page.locator('#statTotal')).toHaveText(String(HOSTS.length - 1))
    const dialog = await openAddDialog(page)
    await expect(dialog.getByLabel('IP or Hostname')).toHaveValue('gaming-pc.home.example')
    await expect(dialog.getByLabel('Comment')).toHaveValue('Gaming PC')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await save(page)
    expect(await savedConfig(request)).toEqual(plain(HOSTS.filter((h) => h.comment !== 'Gaming PC')))
  })

  test('removing the last host shows the empty state', async ({ page, baseURL }) => {
    await open(page, baseURL, { hosts: HOSTS.slice(0, 1) })
    await cards(page).first().getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('No hosts configured')).toBeVisible()
    await expect(page.locator('#statTotal')).toHaveText('0')
  })

  test('deleting two hosts in quick succession removes exactly those two', async ({ page, baseURL, request }) => {
    await open(page, baseURL)
    await card(page, 'Office workstation').getByRole('button', { name: 'Delete' }).click()
    await card(page, 'NAS (backups)').getByRole('button', { name: 'Delete' }).click()
    await expect(cards(page)).toHaveCount(HOSTS.length - 2)
    await save(page)
    expect(await savedConfig(request)).toEqual(plain(HOSTS.slice(2)))
  })

  test('a double click on Delete removes that one host', async ({ page, baseURL, request }) => {
    await open(page, baseURL)
    await card(page, 'Office workstation').getByRole('button', { name: 'Delete' }).dblclick()
    await expect(cards(page)).toHaveCount(HOSTS.length - 1)
    await save(page)
    expect(await savedConfig(request)).toEqual(plain(HOSTS.slice(1)))
  })

  // The grid: cards side by side (a move to the right); compact: a list (a move down).
  for (const [view, compact, to] of [['grid', false, 1], ['compact list', true, 2]] as const) {
    test(`${view}: drag a card to another place, save: the server keeps the new order`, async ({ page, baseURL, request }) => {
      await open(page, baseURL, { settings: { compact } })
      const before = await names(page)
      const from = (await cards(page).nth(0).locator('.wol-card__info').boundingBox())!
      const target = (await cards(page).nth(to).locator('.wol-card__info').boundingBox())!
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 })
      await page.mouse.up()
      await expect(page.locator('#saveBar')).toHaveClass(/is-visible/)
      const after = await names(page)
      expect(after.indexOf(before[0])).toBeGreaterThan(0)
      expect([...after].sort()).toEqual([...before].sort())
      await save(page)
      expect(((await savedConfig(request)) as Host[]).map((h) => h.comment)).toEqual(after)
      await page.reload()
      await expect.poll(() => names(page)).toEqual(after)
    })
  }

  test('cancel throws the unsaved changes away', async ({ page, baseURL }) => {
    await open(page, baseURL)
    await card(page, 'Gaming PC').getByRole('button', { name: 'Delete' }).click()
    await expect(cards(page)).toHaveCount(HOSTS.length - 1)
    await page.locator('#saveBar').getByRole('button', { name: 'Cancel' }).click()
    await expect(cards(page)).toHaveCount(HOSTS.length)
    await expect(card(page, 'Gaming PC')).toBeVisible()
    await expect(page.locator('#saveBar')).not.toHaveClass(/is-visible/)
  })

  test('leaving with unsaved changes asks first', async ({ page, baseURL }) => {
    await open(page, baseURL)
    await card(page, 'Gaming PC').getByRole('button', { name: 'Delete' }).click()
    const dialog = page.waitForEvent('dialog')
    await page.close({ runBeforeUnload: true })
    const d = await dialog
    expect(d.type()).toBe('beforeunload')
    await d.dismiss()
    expect(page.isClosed()).toBe(false)
  })

  test('leaving without changes does not ask', async ({ page, baseURL }) => {
    await open(page, baseURL)
    // A click (the browser asks only after the user did something), no change.
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.close({ runBeforeUnload: true })
    await expect.poll(() => page.isClosed()).toBe(true)
  })
})

test.describe('odd input', () => {
  test("a comment with an apostrophe and HTML: shown as text, wakes, exports, saves; no script runs", async ({ page, baseURL, request }) => {
    const odd = { ...HOSTS[0], comment: `Bob's PC <img src=x onerror="window.__xss=1">` }
    await open(page, baseURL, { hosts: [odd, HOSTS[1]] })
    await expect(card(page, "Bob's PC").locator('.wol-card__name')).toHaveText(odd.comment)
    await card(page, "Bob's PC").getByRole('button', { name: 'Wake' }).click()
    await expect(toast(page).filter({ hasText: `Magic packet has been sent for ${odd.mac}` })).toBeVisible()
    await card(page, 'NAS (backups)').getByRole('button', { name: 'Delete' }).click()
    await expect(cards(page)).toHaveCount(1)
    await save(page)
    expect(await savedConfig(request)).toEqual(plain([odd]))
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  })
})

test.describe('page chrome', () => {
  test('a toast closes with its close button', async ({ page, baseURL }) => {
    await open(page, baseURL, { settings: { toastDuration: 0 } })
    await card(page, 'Office workstation').getByRole('button', { name: 'Wake' }).click()
    await expect(toast(page)).toHaveCount(1)
    await toast(page).getByRole('button', { name: 'Close' }).click()
    await expect(toast(page)).toHaveCount(0)
  })

  test('without the sockets extension the page warns, and the warning stays', async ({ page, baseURL }) => {
    // The image always has sockets: the page as PHP would render it without.
    await page.route(/\/$/, async (route) => {
      const res = await route.fetch()
      const body = (await res.text()).replace('"isSocketExtensionLoaded":1', '"isSocketExtensionLoaded":0')
      await route.fulfill({ response: res, body })
    })
    await page.clock.install()
    await open(page, baseURL)
    await expect(toast(page)).toContainText('Sockets extension not loaded! Enable it in php.ini to send magic packets.')
    await expect(toast(page)).toHaveClass(/toast-warning/)
    // Longer than the default 5 s toast duration.
    await page.clock.runFor(10_000)
    await expect(toast(page)).toContainText('Sockets extension not loaded!')
  })

  test('the title reloads the page; the footer links to GitHub', async ({ page, baseURL }) => {
    await open(page, baseURL)
    await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/phoen-ix/wake-on-lan_plus')
    await page.evaluate(() => ((window as unknown as { before: boolean }).before = true))
    await page.getByRole('link', { name: 'Wake On Lan' }).click()
    await expect.poll(() => page.evaluate(() => 'before' in window)).toBe(false)
    await expect(cards(page)).toHaveCount(HOSTS.length)
  })
})
