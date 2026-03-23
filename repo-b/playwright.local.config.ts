import { defineConfig, devices } from "@playwright/test";

const port = process.env.FRONTEND_PORT || "3100";
const host = process.env.FRONTEND_HOST || "localhost";
const runId = process.env.PW_RUN_ID || `run_${Date.now()}`;

export default defineConfig({
  testDir: "./tests",
  outputDir: `../artifacts/playwright/${runId}`,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 1,
  reporter: [["list"], ["./tests/reporters/repe-jsonl-reporter.ts"]],
  use: {
    baseURL: `http://${host}:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --hostname ${host} --port ${port}`,
    url: `http://${host}:${port}/`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
