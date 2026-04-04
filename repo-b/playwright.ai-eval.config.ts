import { defineConfig, devices } from "@playwright/test";

// AI eval tests run locally against a real backend.
// They are NOT included in CI — they require the dev server and real AI backend to be running.
//
// Usage:
//   cd repo-b
//   npm run test:ai-eval
//
// Requires:
//   - Backend running at http://localhost:8000
//   - BM_SESSION_SECRET env var (defaults to "playwright-auth-secret" for local dev)

const port = "3103"; // Dedicated port to avoid collision with other playwright configs
const host = "localhost";

export default defineConfig({
  testDir: "./tests/ai-evals",
  outputDir: "../artifacts/ai-evals",
  timeout: 120_000,          // Real LLM calls can be slow
  expect: { timeout: 60_000 },
  fullyParallel: false,      // Serial: avoid rate limit races on shared real backend
  retries: 0,                // Failures are signal, not flakiness — no retries
  reporter: [
    ["list"],
    ["json", { outputFile: "../artifacts/ai-evals/ai-eval-results.json" }],
  ],
  use: {
    baseURL: `http://${host}:${port}`,
    screenshot: "on",        // Capture every run for receipts
    video: "off",
    trace: "off",
  },
  webServer: {
    command: `BM_SESSION_SECRET=playwright-auth-secret PORT=${port} PLAYWRIGHT_BYPASS_AUTH=1 npm run dev -- --hostname ${host} --port ${port}`,
    url: `http://${host}:${port}/`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      BM_SESSION_SECRET: process.env.BM_SESSION_SECRET || "playwright-auth-secret",
      PLAYWRIGHT_BYPASS_AUTH: "1",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
