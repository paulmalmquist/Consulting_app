import { defineConfig, devices } from "@playwright/test";

const port = process.env.FRONTEND_PORT || "3002";
const runId = process.env.PW_RUN_ID || `auth_${Date.now()}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: /environment-auth\.spec\.ts/,
  outputDir: `../artifacts/playwright/${runId}`,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["./tests/reporters/repe-jsonl-reporter.ts"]]
    : [["list"], ["./tests/reporters/repe-jsonl-reporter.ts"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: [
      "env",
      "PORT=" + port,
      "BM_SESSION_SECRET=playwright-auth-secret",
      "BOS_API_ORIGIN=http://127.0.0.1:8000",
      "DEMO_API_ORIGIN=http://127.0.0.1:8000",
      "DEMO_API_BASE_URL=http://127.0.0.1:8000",
      "NEXT_PUBLIC_DEMO_API_BASE_URL=http://127.0.0.1:8000",
      "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000",
      "sh -c 'rm -rf .next && npm run build -- --no-lint && npm run start'",
    ].join(" "),
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
