import { defineConfig, devices } from "@playwright/test";

/**
 * Production test config — runs against https://www.paulmalmquist.com
 * No web server (tests hit the live site). No mocking.
 * Longer timeouts to account for Railway cold starts and Vercel edge latency.
 */

const runId = process.env.PW_RUN_ID || `prod_${Date.now()}`;

export default defineConfig({
  testDir: "./tests/production",
  outputDir: `../artifacts/playwright/${runId}`,
  timeout: 60_000,          // 60s per test (real network)
  expect: { timeout: 20_000 }, // 20s for assertions
  fullyParallel: false,     // serial — avoid hammering prod backend
  retries: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: `../artifacts/playwright-reports/${runId}` }],
    ["./tests/reporters/repe-jsonl-reporter.ts"],
  ],
  use: {
    baseURL: "https://www.paulmalmquist.com",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Real browser, no headless for debugging if needed
    headless: process.env.PW_HEADED !== "1",
    // Capture all console messages and network failures
    ignoreHTTPSErrors: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // No webServer — we're hitting production directly
});
