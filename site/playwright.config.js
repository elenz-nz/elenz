// Browser tests (`npm run test:browsers`, after `npm run build`; tests/e2e/). They open the built site in real browsers:
// Chromium (Chrome, Edge, Samsung Internet), Firefox and WebKit (Safari's engine), at desktop and phone sizes. In
// checks.yml they gate every merge. Locally, `npx playwright install` first fetches the browsers.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // one retry for a slow machine; a real fault fails both tries
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'phone-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'phone-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/about`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
