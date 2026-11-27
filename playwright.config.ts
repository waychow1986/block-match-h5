import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4173);
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 6 * 60_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: externalBaseUrl ?? `http://localhost:${port}`,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `npm run build && npx vite preview --port ${port} --strictPort`,
        url: `http://localhost:${port}`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
