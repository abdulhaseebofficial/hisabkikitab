const { defineConfig } = require('@playwright/test');
const { frontendURL } = require('../../scripts/frontend-config');
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '*.spec.js',
  outputDir: require('path').resolve(__dirname, '../../test-results/browser'),
  timeout: 240000,
  expect: { timeout: 20000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: process.env.BROWSER_BASE_URL || frontendURL, screenshot: 'only-on-failure' },
  // An explicit URL targets an already managed deployment. Otherwise Playwright
  // waits for Vite and owns its process, including cleanup after failed tests.
  webServer: process.env.BROWSER_BASE_URL ? undefined : {
    command: 'npm run dev:web',
    cwd: require('path').resolve(__dirname, '../..'),
    url: frontendURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    { name: 'desktop-en', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-roman-ur', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
