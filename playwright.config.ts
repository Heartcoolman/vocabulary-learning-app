import { defineConfig, devices } from '@playwright/test';

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizePathPrefix(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return fallback;
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function resolveUrlFromEnv(envKey: string, fallback: string): URL {
  const candidate = process.env[envKey];
  try {
    return new URL(candidate || fallback);
  } catch {
    return new URL(fallback);
  }
}

const frontendUrl = resolveUrlFromEnv('E2E_FRONTEND_URL', 'http://localhost:5173');
const backendUrl = resolveUrlFromEnv('E2E_BACKEND_URL', 'http://localhost:3000');

const FRONTEND_ORIGIN = normalizeBaseUrl(frontendUrl.origin);
const BACKEND_ORIGIN = normalizeBaseUrl(backendUrl.origin);

const HEALTHCHECK_ENDPOINT = normalizePathPrefix(process.env.HEALTHCHECK_ENDPOINT, '/health');
const BACKEND_READY_URL = `${BACKEND_ORIGIN}${HEALTHCHECK_ENDPOINT}/ready`;

const FRONTEND_PORT = frontendUrl.port ? parseInt(frontendUrl.port, 10) : 5173;
const BACKEND_PORT = backendUrl.port ? parseInt(backendUrl.port, 10) : 3000;

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
    baseURL: FRONTEND_ORIGIN,
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
      command:
        `NODE_ENV=test PORT=${BACKEND_PORT} ` +
        `CORS_ORIGIN="${FRONTEND_ORIGIN}" ` +
        `HEALTHCHECK_ENDPOINT="${HEALTHCHECK_ENDPOINT}" ` +
        'pnpm --filter @danci/backend dev',
      url: BACKEND_READY_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000
    },
    {
      command: `VITE_API_URL="${BACKEND_ORIGIN}" pnpm --filter @danci/frontend dev -- --port ${FRONTEND_PORT}`,
      url: FRONTEND_ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000
    }
  ]
});
