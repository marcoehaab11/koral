import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  timeout: 60000,
  use: { baseURL: 'http://localhost:5066', browserName: 'chromium', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: 'powershell -NoProfile -File ../scripts/Start-TestServer.ps1',
    url: 'http://localhost:5066/api',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
