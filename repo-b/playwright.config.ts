import { defineConfig, devices } from "@playwright/test";

const port = process.env.FRONTEND_PORT || "3001";
const runId = process.env.PW_RUN_ID || `run_${Date.now()}`;

export default defineConfig({
  testDir: "./tests",
  outputDir: `../artifacts/playwright/${runId}`,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["./tests/reporters/repe-jsonl-reporter.ts"]]
    : [["list"], ["./tests/reporters/repe-jsonl-reporter.ts"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: `PLAYWRIGHT_BYPASS_AUTH=1 PORT=${port} npm run dev`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
