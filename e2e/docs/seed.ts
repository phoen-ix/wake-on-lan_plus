import { request } from '@playwright/test'

/* The demo hosts of the docs tour. Fictional: locally administered MACs (02-…)
 * and documentation-only addresses (RFC 5737, *.example), so a magic packet the
 * tour sends never reaches a real network. `up` is what the tour's HOST.CHECK
 * mock answers: the open port the card shows, or null for offline. */
export const HOSTS = [
  { mac: '02-5E-10-00-00-11', host: '192.0.2.11', cidr: '24', port: '9', comment: 'Office workstation', up: '3389 (RDP)' },
  { mac: '02-5E-10-00-00-12', host: '192.0.2.12', cidr: '24', port: '9', comment: 'NAS (backups)', up: '22 (SSH)' },
  { mac: '02-5E-10-00-00-13', host: '192.0.2.13', cidr: '24', port: '9', comment: 'Media server', up: '80 (HTTP)' },
  { mac: '02-5E-10-00-00-14', host: 'gaming-pc.home.example', cidr: '24', port: '9', comment: 'Gaming PC', up: null },
  { mac: '02-5E-10-00-00-15', host: '192.0.2.15', cidr: '24', port: '9', comment: 'Build server', up: '443 (HTTPS)' },
  { mac: '02-5E-10-00-00-27', host: '198.51.100.27', cidr: '24', port: '7', comment: 'Lab test bench', up: null },
] as const

/** The host the tour adds through the dialog (and imports as JSON). */
export const NEW_HOST = { mac: '02-5E-10-00-00-40', host: '192.0.2.40', cidr: '24', port: '9', comment: 'Office printer', up: '80 (HTTP)' } as const

export type Host = (typeof HOSTS)[number] | typeof NEW_HOST

/** Replace the server's config.json with `hosts` through the app's own API
 * (CONFIG.SET with the page's CSRF token), so it is idempotent. */
export async function seed(hosts: readonly Host[], baseURL: string): Promise<void> {
  const api = await request.newContext({ baseURL })
  try {
    const html = await (await api.get('/')).text()
    const token = /"csrfToken":"([0-9a-f]{64})"/.exec(html)?.[1]
    if (!token) throw new Error('[seed] no CSRF token in the page')
    const res = await api.post('/index.php?aop=CONFIG.SET', {
      headers: { 'X-CSRF-TOKEN': token },
      data: hosts.map(({ up: _up, ...h }) => h),
    })
    if (!res.ok()) throw new Error(`[seed] CONFIG.SET: ${res.status()} ${await res.text()}`)
  } finally {
    await api.dispose()
  }
}
