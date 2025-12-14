import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],
  outputDir: 'test-results',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    storageState: undefined
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    // 取消注释以启用多浏览器测试
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] }
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] }
    // },
    // {
    //   name: 'mobile-chrome',
    //   use: { ...devices['Pixel 5'] }
    // },
    // {
    //   name: 'mobile-safari',
    //   use: { ...devices['iPhone 12'] }
    // }
  ],

  webServer: [
    {
      command: 'NODE_ENV=test pnpm --filter @danci/backend dev',
      url: 'http://localhost:3000/api/about/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000
    },
    {
      command: 'pnpm --filter @danci/frontend dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000
    }
  ]
});
