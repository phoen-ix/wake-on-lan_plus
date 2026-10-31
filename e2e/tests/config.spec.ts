import { readFileSync } from 'node:fs'

import { card, cards, expect, HOSTS, NEW_HOST, open, openOptions, plain, savedConfig, seed, test, toast } from './fixtures'

/* The options menu: download, export, import, load and save. */

const { up: _up, ...printer } = NEW_HOST

async function importJson(page: import('@playwright/test').Page, json: string, overwrite = false) {
  await (await openOptions(page)).getByRole('link', { name: 'Import Configuration' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import Configuration' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('JSON Configuration').fill(json)
  await dialog.getByLabel('Overwrite existing configuration').setChecked(overwrite)
  await dialog.getByRole('button', { name: 'Import' }).click()
  return dialog
}

test('download: the saved file, named wake-on-lan-<date>-<time>.json', async ({ page, baseURL }) => {
  await open(page, baseURL)
  const download = page.waitForEvent('download')
  await (await openOptions(page)).getByRole('link', { name: 'Download Configuration' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^wake-on-lan-\d{8}-\d{6}\.json$/)
  expect(JSON.parse(readFileSync((await file.path())!, 'utf8'))).toEqual(plain(HOSTS))
})

test('export: the page as it is, unsaved changes included', async ({ page, baseURL }) => {
  await open(page, baseURL)
  await card(page, 'Gaming PC').getByRole('button', { name: 'Delete' }).click()
  await expect(cards(page)).toHaveCount(HOSTS.length - 1)
  await (await openOptions(page)).getByRole('link', { name: 'Export Configuration' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export Configuration' })
  await expect(dialog).toBeVisible()
  const json = await dialog.getByLabel('JSON Configuration').inputValue()
  expect(JSON.parse(json)).toEqual(plain(HOSTS.filter((h) => h.comment !== 'Gaming PC')))
  await dialog.getByRole('button', { name: 'Close' }).last().click()
  await expect(dialog).toBeHidden()
})

test('import appends to the page; save stores it', async ({ page, baseURL, request }) => {
  await open(page, baseURL)
  const dialog = await importJson(page, JSON.stringify([printer]))
  await expect(dialog).toBeHidden()
  await expect(cards(page)).toHaveCount(HOSTS.length + 1)
  await expect(card(page, NEW_HOST.comment)).toBeVisible()
  await page.locator('#saveBar').getByRole('button', { name: 'Save' }).click()
  await expect(toast(page).filter({ hasText: 'Configuration saved successfully.' })).toBeVisible()
  expect(await savedConfig(request)).toEqual(plain([...HOSTS, NEW_HOST]))
})

test('import with "Overwrite existing configuration" replaces the page', async ({ page, baseURL }) => {
  await open(page, baseURL)
  await importJson(page, JSON.stringify([printer]), true)
  await expect(cards(page)).toHaveCount(1)
  await expect(card(page, NEW_HOST.comment)).toBeVisible()
  await expect(page.locator('#saveBar')).toHaveClass(/is-visible/)
})

for (const [what, json, message] of [
  ['broken JSON', `[{ "mac": "${NEW_HOST.mac}", `, 'SyntaxError'],
  ['not a list', JSON.stringify(printer), 'a list of hosts'],
  ['null', 'null', 'a list of hosts'],
  ['a host without MAC', JSON.stringify([{ host: '192.0.2.50' }]), 'a list of hosts'],
] as const) {
  test(`import of ${what}: an error in the dialog, the page unchanged`, async ({ page, baseURL }) => {
    await open(page, baseURL)
    const dialog = await importJson(page, json)
    await expect(dialog.getByRole('alert')).toContainText(message)
    await expect(dialog).toBeVisible()
    await expect(cards(page)).toHaveCount(HOSTS.length)
    await expect(page.locator('#saveBar')).not.toHaveClass(/is-visible/)
  })
}

test.describe('load configuration', () => {
  async function load(page: import('@playwright/test').Page, button: string) {
    await (await openOptions(page)).getByRole('link', { name: 'Load Configuration', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /Load(ing)? Configuration/ })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: button }).click()
    await expect(dialog).toBeHidden()
  }

  test('replace: the page shows the saved hosts again, unsaved changes gone', async ({ page, baseURL }) => {
    await open(page, baseURL)
    await card(page, 'Gaming PC').getByRole('button', { name: 'Delete' }).click()
    // Someone else saved meanwhile.
    await seed([...HOSTS, NEW_HOST], baseURL!)
    await load(page, 'Replace Existing')
    await expect(cards(page)).toHaveCount(HOSTS.length + 1)
    await expect(page.locator('#saveBar')).not.toHaveClass(/is-visible/)
  })

  test('append: the saved hosts after the ones on the page, unsaved', async ({ page, baseURL }) => {
    await open(page, baseURL)
    await load(page, 'Append To Existing')
    await expect(cards(page)).toHaveCount(HOSTS.length * 2)
    await expect(page.locator('#saveBar')).toHaveClass(/is-visible/)
  })

  test('cancel: nothing changes', async ({ page, baseURL }) => {
    await open(page, baseURL)
    await load(page, 'Cancel')
    await expect(cards(page)).toHaveCount(HOSTS.length)
    await expect(page.locator('#saveBar')).not.toHaveClass(/is-visible/)
  })
})

test('"Save Configuration" in the menu: only with unsaved changes, and it saves', async ({ page, baseURL, request }) => {
  await open(page, baseURL)
  let menu = await openOptions(page)
  await expect(menu.getByRole('link', { name: 'Save Configuration' })).toBeHidden()
  await page.keyboard.press('Escape')
  await card(page, 'Gaming PC').getByRole('button', { name: 'Delete' }).click()
  menu = await openOptions(page)
  await menu.getByRole('link', { name: 'Save Configuration' }).click()
  await expect(toast(page).filter({ hasText: 'Configuration saved successfully.' })).toBeVisible()
  expect(await savedConfig(request)).toEqual(plain(HOSTS.filter((h) => h.comment !== 'Gaming PC')))
  await expect(page.locator('#saveBar')).not.toHaveClass(/is-visible/)
})
