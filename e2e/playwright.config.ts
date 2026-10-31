import { defineConfig, devices } from '@playwright/test'

/* The e2e suite (./tests) against a running container; scripts/e2e.sh builds
 * the image, starts it twice (open, and with Basic Auth) and runs this.
 *
 *   npx playwright test
 *
 * One worker: every test replaces the server's single config.json. */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: process.env.E2E_REPORT ?? 'playwright-report' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:25500',
    locale: 'en-GB',
    timezoneId: 'Europe/Vienna',
    // Bootstrap ignores a modal's Close while the modal is still fading in.
    contextOptions: { reducedMotion: 'reduce' },
    actionTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})
