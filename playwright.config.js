// Browser tests for the key screens. Runs the real server against the test database
// (reset and seeded first) with mock AI, payments and email.
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const env = { ...process.env, NODE_ENV: 'test', PORT: String(PORT), APP_URL: `http://localhost:${PORT}` };

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
  ],
  webServer: { command: 'node server/index.js', url: `http://localhost:${PORT}/api/health`, env, reuseExistingServer: false, timeout: 60000 },
});
