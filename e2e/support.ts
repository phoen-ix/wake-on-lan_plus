import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BrowserContext, Route } from '@playwright/test'

import { HOSTS, NEW_HOST } from './docs/seed'

/* Shared by the docs tour (./docs) and the e2e suite (./tests).
 *
 * The page loads Bootstrap, jQuery, Font Awesome and Google Fonts from CDNs.
 * serveCdnLocally() serves the same pinned versions from e2e/node_modules and
 * aborts (and records in `leaked`) every other request that leaves the app. */

const MODULES = fileURLToPath(new URL('./node_modules', import.meta.url))

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

export async function serveCdnLocally(ctx: BrowserContext, appHost: string, leaked: string[]) {
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

/** HOST.CHECK answered from HOSTS[].up (the demo hosts do not exist): the open
 * port, or offline for null and any other host. */
export function mockHostCheck(route: Route) {
  const host = new URL(route.request().url()).searchParams.get('host')
  const up = [...HOSTS, NEW_HOST].find((h) => h.host === host)?.up
  return route.fulfill({
    json: up
      ? { error: false, isUp: true, info: up, errCode: '', errStr: '', errorPort: '' }
      : { error: false, isUp: false, errCode: 110, errStr: 'Connection timed out', errorPort: '5938' },
  })
}
