// Playwright (ATLAS-001 F-10, FR-59): Chromium only (DEC-055 defers WebKit and screenshot baselines), against
// the production build (`next start`) and the real backend started by e2e/support/global-setup.ts.
// Adding WebKit later is one more entry in `projects`.
import { defineConfig, devices } from "@playwright/test";

import { WEB_ORIGIN } from "./e2e/support/config";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/playwright",
  globalSetup: "./e2e/support/global-setup.ts",
  // One shared backend stack whose dependencies the tests take down and bring back: run serially.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: WEB_ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium" } }],
  webServer: {
    command: "pnpm start",
    url: WEB_ORIGIN,
    timeout: 60_000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
