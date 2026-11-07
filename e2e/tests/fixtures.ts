import { execFileSync } from 'node:child_process'

import { test as base, expect, request, type APIRequestContext, type Locator, type Page } from '@playwright/test'

import { HOSTS, NEW_HOST, seed, seedVia, type Host } from '../docs/seed'
import { mockHostCheck, serveCdnLocally } from '../support'

export { expect, HOSTS, NEW_HOST, seed, seedVia, type Host }

/* Shared by every spec. The demo hosts (../docs/seed.ts) do not exist:
 * HOST.CHECK is mocked unless a test unroutes it, and their magic packets go
 * to RFC 5737 documentation addresses. Each test replaces the server's whole
 * config.json first (one worker, see playwright.config.ts). */

/** The second container of scripts/e2e.sh: Basic Auth on, one wake a minute. */
export const AUTH = {
  url: process.env.E2E_AUTH_URL ?? 'http://127.0.0.1:25501',
  username: 'e2e-admin',
  password: 'e2e-password-not-secret',
}

const CONTAINER = process.env.E2E_CONTAINER ?? 'wake-on-lan_plus_e2e'

/** `docker exec` into the open container (scripts/e2e.sh sets E2E_CONTAINER). */
export function inContainer(script: string, container = CONTAINER): string {
  return execFileSync('docker', ['exec', container, 'sh', '-c', script], { encoding: 'utf8' })
}

export const test = base.extend<{ guard: void }>({
  // Every test: no page error, nothing fetched from outside the app.
  guard: [
    async ({ page, baseURL }, use) => {
      // The rate limits count per client IP, and every test comes from the same one: start at zero.
      for (const c of [CONTAINER, `${CONTAINER}-auth`]) inContainer('rm -f /tmp/wol-rate-limit.json', c)
      const errors: string[] = []
      const leaked: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await serveCdnLocally(page.context(), new URL(baseURL!).host, leaked)
      await page.route(/[?&]aop=HOST\.CHECK/, mockHostCheck)
      await use()
      expect(errors, 'page errors').toEqual([])
      expect(leaked, 'requests that left the app').toEqual([])
    },
    { auto: true },
  ],
})

/** Seed `hosts`, open the page with `settings` in localStorage (once: a
 * reload keeps what the test changed) and wait for the cards. */
export async function open(
  page: Page,
  baseURL: string | undefined,
  { hosts = HOSTS, settings = {}, path = '/' }: { hosts?: readonly Host[]; settings?: object; path?: string } = {},
) {
  await seed(hosts, baseURL!)
  await page.addInitScript((s) => {
    if (localStorage.getItem('wol_settings') === null) localStorage.setItem('wol_settings', JSON.stringify(s))
  }, settings)
  await page.goto(path)
  await expect(page.locator('#hostGrid .wol-card')).toHaveCount(hosts.length)
  await expect(page.locator('#statTotal')).toHaveText(String(hosts.length))
}

/** A fresh session (own cookie) with the page's CSRF token. */
export async function session(baseURL: string, opts: Parameters<typeof request.newContext>[0] = {}) {
  const api = await request.newContext({ baseURL, ...opts })
  const html = await (await api.get('/')).text()
  const token = /"csrfToken":"([0-9a-f]{64})"/.exec(html)?.[1] ?? ''
  return { api, token }
}

export async function savedConfig(api: APIRequestContext) {
  return (await api.get('/index.php?aop=CONFIG.GET')).json()
}

export const cards = (page: Page) => page.locator('#hostGrid .wol-card')
export const card = (page: Page, name: string) => cards(page).filter({ hasText: name })
export const toast = (page: Page) => page.locator('#toastContainer .wol-toast')
export const names = (page: Page) => page.locator('#hostGrid .wol-card__name').allTextContents()

export async function openOptions(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Options' }).click()
  const menu = page.locator('.dropdown-menu.show')
  await expect(menu).toBeVisible()
  return menu
}

export async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Settings' }).click()
  const panel = page.locator('#settingsPanel')
  await expect(panel).toHaveClass(/is-open/)
  return panel
}

export async function save(page: Page) {
  await page.locator('#saveBar').getByRole('button', { name: 'Save' }).click()
  await expect(toast(page).filter({ hasText: 'Configuration saved successfully.' })).toBeVisible()
  await expect(page.locator('#saveBar')).not.toHaveClass(/is-visible/)
}

/** The hosts without the mock's `up`. */
export const plain = (hosts: readonly Host[]) => hosts.map(({ up: _up, ...h }) => h)
