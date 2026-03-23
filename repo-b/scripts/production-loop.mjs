#!/usr/bin/env node
/**
 * production-loop.mjs
 *
 * Deploy-and-test loop for the RE PE platform.
 *
 * What it does:
 *   1. Run production Playwright tests against paulmalmquist.com
 *   2. If tests pass → done (or keep looping if LOOP_FOREVER=1)
 *   3. If tests fail → print structured failure summary for diagnosis
 *   4. After a fix is committed:
 *      a. Detect what changed (backend vs frontend)
 *      b. Deploy changed services (railway redeploy / vercel --prod)
 *      c. Wait for deploys to become healthy (polling, not sleeping blind)
 *      d. Re-run tests
 *   5. Repeat up to MAX_ITERATIONS (default: 10)
 *
 * Usage:
 *   node scripts/production-loop.mjs
 *
 * Options (env vars):
 *   MAX_ITERATIONS=10       Stop after N deploy+test cycles (0 = run once, no deploy loop)
 *   LOOP_FOREVER=1          Run test-only loop forever (no deploys)
 *   SKIP_DEPLOY=1           Skip deployment step (just run tests)
 *   PW_HEADED=1             Show browser window
 *   RAILWAY_WAIT_SEC=180    Max seconds to wait for Railway deploy (default 180)
 *   VERCEL_WAIT_SEC=240     Max seconds to wait for Vercel deploy (default 240)
 *   TEST_SPEC=...           Override test spec path
 */

import { spawnSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dir, "..");
const projectRoot = path.resolve(repoRoot, "..");

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS ?? "10");
const LOOP_FOREVER = process.env.LOOP_FOREVER === "1";
const SKIP_DEPLOY = process.env.SKIP_DEPLOY === "1";
const RAILWAY_WAIT_SEC = Number(process.env.RAILWAY_WAIT_SEC ?? "180");
const VERCEL_WAIT_SEC = Number(process.env.VERCEL_WAIT_SEC ?? "240");
const TEST_SPEC = process.env.TEST_SPEC ?? "tests/production/re-production.spec.ts";
const PROD_URL = "https://www.paulmalmquist.com";
const BACKEND_HEALTH = "https://authentic-sparkle-production-7f37.up.railway.app/health";
const PROXY_HEALTH = `${PROD_URL}/bos/health`;

const artifactsDir = path.join(projectRoot, "artifacts", "production-loop");
mkdirSync(artifactsDir, { recursive: true });

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level, msg) {
  const ts = new Date().toISOString();
  const prefix = { INFO: "✦", WARN: "⚠", PASS: "✅", FAIL: "❌", WAIT: "⏳", DEPLOY: "🚀" }[level] ?? "·";
  console.log(`[${ts}] ${prefix} ${msg}`);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchJSON(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function isHealthy(url) {
  const body = await fetchJSON(url);
  return body !== null && (body.ok === true || body.status === "ok");
}

// ─── Deploy wait logic ────────────────────────────────────────────────────────

/**
 * Poll a health URL until it responds OK or we time out.
 * Uses exponential backoff: 5s → 10s → 15s → 20s (capped).
 */
async function waitForHealth(url, label, maxSec) {
  const deadline = Date.now() + maxSec * 1000;
  let wait = 5;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts++;
    const ok = await isHealthy(url);
    if (ok) {
      log("PASS", `${label} is healthy (attempt ${attempts})`);
      return true;
    }
    const remaining = Math.round((deadline - Date.now()) / 1000);
    log("WAIT", `${label} not ready yet (attempt ${attempts}, ${remaining}s remaining) — retrying in ${wait}s`);
    await sleep(wait * 1000);
    wait = Math.min(wait + 5, 20);
  }
  log("FAIL", `${label} did not become healthy within ${maxSec}s`);
  return false;
}

/**
 * Wait for Railway to finish deploying by polling `railway service status --all`.
 * Returns true when status is SUCCESS (not DEPLOYING/FAILED).
 */
async function waitForRailway(maxSec) {
  log("WAIT", "Waiting for Railway deploy to complete...");
  const deadline = Date.now() + maxSec * 1000;
  let wait = 10;
  while (Date.now() < deadline) {
    const result = spawnSync("railway", ["service", "status", "--all"], {
      cwd: path.join(projectRoot, "backend"),
      encoding: "utf-8",
    });
    const output = (result.stdout ?? "") + (result.stderr ?? "");
    if (output.includes("SUCCESS")) {
      log("PASS", "Railway deploy completed successfully");
      // Extra: wait for health check to pass
      return await waitForHealth(BACKEND_HEALTH, "Railway backend health", 60);
    }
    if (output.includes("FAILED")) {
      log("FAIL", `Railway deploy FAILED:\n${output}`);
      return false;
    }
    const remaining = Math.round((deadline - Date.now()) / 1000);
    log("WAIT", `Railway status: DEPLOYING (${remaining}s remaining) — checking in ${wait}s`);
    await sleep(wait * 1000);
    wait = Math.min(wait + 5, 30);
  }
  log("FAIL", `Railway deploy did not complete within ${maxSec}s`);
  return false;
}

/**
 * Wait for Vercel to finish deploying.
 * We can't easily poll Vercel deploy status from CLI without project linking,
 * so we poll the proxy health endpoint which requires both Vercel + Railway to be up.
 */
async function waitForVercel(maxSec) {
  log("WAIT", "Waiting for Vercel deploy to propagate...");
  // Give Vercel a head start before polling
  await sleep(30_000);
  return await waitForHealth(PROXY_HEALTH, "Vercel /bos proxy health", maxSec);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Git / change detection ───────────────────────────────────────────────────

function getChangedFiles() {
  try {
    const out = execSync("git diff --name-only HEAD~1 HEAD", {
      cwd: projectRoot,
      encoding: "utf-8",
    });
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function backendChanged(files) {
  return files.some((f) => f.startsWith("backend/"));
}

function frontendChanged(files) {
  return files.some((f) => f.startsWith("repo-b/") || f.startsWith("repo-b\\"));
}

// ─── Deploy ───────────────────────────────────────────────────────────────────

async function deployBackend() {
  log("DEPLOY", "Deploying backend to Railway...");
  const result = spawnSync("railway", ["redeploy", "--yes"], {
    cwd: path.join(projectRoot, "backend"),
    stdio: "inherit",
  });
  if (result.status !== 0) {
    log("FAIL", "railway redeploy failed");
    return false;
  }
  return waitForRailway(RAILWAY_WAIT_SEC);
}

async function deployFrontend() {
  log("DEPLOY", "Deploying frontend to Vercel...");
  const result = spawnSync("vercel", ["--prod", "--yes"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, VERCEL_PROJECT_ID: "prj_0wG8qDaXVJ5C5y2tKeIYsXqG9iLH" },
  });
  if (result.status !== 0) {
    log("FAIL", "vercel --prod failed");
    return false;
  }
  return waitForVercel(VERCEL_WAIT_SEC);
}

async function deployIfNeeded() {
  if (SKIP_DEPLOY) {
    log("INFO", "SKIP_DEPLOY=1 — skipping deploy step");
    return true;
  }
  const changed = getChangedFiles();
  log("INFO", `Changed files since last commit: ${changed.length > 0 ? changed.join(", ") : "(none)"}`);

  const needsBackend = backendChanged(changed);
  const needsFrontend = frontendChanged(changed) || changed.length === 0;

  if (needsBackend) {
    const ok = await deployBackend();
    if (!ok) return false;
  }
  if (needsFrontend) {
    const ok = await deployFrontend();
    if (!ok) return false;
  }
  if (!needsBackend && !needsFrontend) {
    log("INFO", "No relevant changes detected — skipping deploy");
  }
  return true;
}

// ─── Test runner ──────────────────────────────────────────────────────────────

function runTests(iteration) {
  const runId = `prod_iter_${iteration}_${Date.now()}`;
  const outputDir = path.join(artifactsDir, runId);
  mkdirSync(outputDir, { recursive: true });

  log("INFO", `Running production tests (iteration ${iteration}, runId: ${runId})`);

  const result = spawnSync(
    "npx",
    [
      "playwright", "test", TEST_SPEC,
      "--config", "playwright.production.config.ts",
      "--project", "chromium",
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        PW_RUN_ID: runId,
      },
    }
  );

  const passed = result.status === 0;
  log(passed ? "PASS" : "FAIL", `Tests ${passed ? "PASSED" : "FAILED"} (exit ${result.status})`);

  // Write iteration summary
  const summary = {
    iteration,
    runId,
    passed,
    exitCode: result.status,
    timestamp: new Date().toISOString(),
    outputDir,
  };
  writeFileSync(
    path.join(outputDir, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

  return passed;
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function main() {
  log("INFO", `Production test loop starting`);
  log("INFO", `  Target: ${PROD_URL}`);
  log("INFO", `  Backend: ${BACKEND_HEALTH}`);
  log("INFO", `  Max iterations: ${MAX_ITERATIONS === 0 ? "1 (no deploy loop)" : MAX_ITERATIONS}`);
  log("INFO", `  Skip deploy: ${SKIP_DEPLOY}`);
  log("INFO", `  Spec: ${TEST_SPEC}`);

  // First, verify both services are reachable before running tests
  log("INFO", "Pre-flight: checking both services are reachable...");
  const backendOk = await isHealthy(BACKEND_HEALTH);
  const proxyOk = await isHealthy(PROXY_HEALTH);

  if (!backendOk) {
    log("WARN", `Backend health check failed — Railway may be sleeping or down`);
    log("WAIT", "Waiting up to 60s for backend to wake up...");
    await waitForHealth(BACKEND_HEALTH, "Railway backend", 60);
  }
  if (!proxyOk) {
    log("WARN", `Proxy health check failed — Vercel may not have BOS_API_ORIGIN set correctly`);
  }

  // Single run mode (MAX_ITERATIONS=0 or LOOP_FOREVER without deploy)
  if (MAX_ITERATIONS === 0) {
    const passed = runTests(1);
    process.exit(passed ? 0 : 1);
  }

  // Loop mode
  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    log("INFO", `\n${"─".repeat(60)}`);
    log("INFO", `Iteration ${i} of ${MAX_ITERATIONS}`);

    // Deploy (first iteration is usually already deployed)
    if (i > 1) {
      const deployOk = await deployIfNeeded();
      if (!deployOk) {
        log("FAIL", `Deploy failed on iteration ${i} — stopping loop`);
        process.exit(1);
      }
    }

    const passed = runTests(i);

    if (passed) {
      log("PASS", `All tests passed on iteration ${i}!`);
      if (!LOOP_FOREVER) {
        log("INFO", "Loop complete. Exiting with success.");
        process.exit(0);
      }
      log("INFO", "LOOP_FOREVER=1 — waiting 30s then running again...");
      await sleep(30_000);
    } else {
      log("FAIL", `Tests failed on iteration ${i}.`);
      log("INFO", `Check artifacts at: ${path.join(artifactsDir)}`);
      log("INFO", `HTML report: npx playwright show-report ../artifacts/playwright/prod_iter_${i}_*/html`);

      if (i < MAX_ITERATIONS) {
        log("INFO", `Waiting for a fix to be committed before iteration ${i + 1}...`);
        log("INFO", `Press Enter or wait 30s to continue with the next iteration.`);
        await sleep(30_000);
      } else {
        log("FAIL", `Reached MAX_ITERATIONS=${MAX_ITERATIONS} with failures. Exiting.`);
        process.exit(1);
      }
    }
  }
}

main().catch((err) => {
  log("FAIL", `Unhandled error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
