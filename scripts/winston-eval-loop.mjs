#!/usr/bin/env node
/**
 * winston-eval-loop.mjs
 *
 * Integrated Winston evaluation loop that ties together:
 *   1. Local backend eval (eval_loop/runner.py)
 *   2. Deploy to Railway / Vercel (if needed)
 *   3. Live-site Playwright eval (ai-evals)
 *   4. Merge results into combined cycle report
 *   5. Iterate until stable
 *
 * Usage:
 *   node scripts/winston-eval-loop.mjs
 *
 * Options (env vars):
 *   MAX_ITERATIONS=5        Stop after N cycles (default: 5)
 *   SKIP_DEPLOY=1           Skip deployment step
 *   SKIP_FRONTEND=1         Skip Playwright frontend eval
 *   SKIP_BACKEND=1          Skip backend eval
 *   EVAL_SUITE=smoke        Backend eval suite (smoke or full, default: smoke)
 *   BACKEND_HEALTH=url      Override backend health URL
 *   PROD_URL=url            Override production URL
 */

import { spawnSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dir, "..");
const repoB = path.join(projectRoot, "repo-b");
const backendDir = path.join(projectRoot, "backend");

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS ?? "5");
const SKIP_DEPLOY = process.env.SKIP_DEPLOY === "1";
const SKIP_FRONTEND = process.env.SKIP_FRONTEND === "1";
const SKIP_BACKEND = process.env.SKIP_BACKEND === "1";
const EVAL_SUITE = process.env.EVAL_SUITE ?? "smoke";
const PROD_URL = process.env.PROD_URL ?? "https://www.paulmalmquist.com";
const BACKEND_HEALTH =
  process.env.BACKEND_HEALTH ??
  "https://authentic-sparkle-production-7f37.up.railway.app/health";
const RAILWAY_WAIT_SEC = Number(process.env.RAILWAY_WAIT_SEC ?? "180");

const artifactsDir = path.join(projectRoot, "artifacts", "eval-loop");
const frontendArtifactsDir = path.join(projectRoot, "artifacts", "ai-evals");
mkdirSync(artifactsDir, { recursive: true });

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level, msg) {
  const ts = new Date().toISOString();
  const prefix =
    {
      INFO: "·",
      WARN: "⚠",
      PASS: "✓",
      FAIL: "✗",
      WAIT: "…",
      DEPLOY: "→",
    }[level] ?? "·";
  console.log(`[${ts}] ${prefix} ${msg}`);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function isHealthy(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return false;
    const body = await res.json();
    return body.ok === true || body.status === "ok";
  } catch {
    return false;
  }
}

async function waitForHealth(url, label, maxSec) {
  const deadline = Date.now() + maxSec * 1000;
  let wait = 5;
  while (Date.now() < deadline) {
    const ok = await isHealthy(url);
    if (ok) {
      log("PASS", `${label} is healthy`);
      return true;
    }
    const remaining = Math.round((deadline - Date.now()) / 1000);
    log("WAIT", `${label} not ready (${remaining}s remaining)`);
    await sleep(wait * 1000);
    wait = Math.min(wait + 5, 20);
  }
  log("FAIL", `${label} did not become healthy within ${maxSec}s`);
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Deploy ───────────────────────────────────────────────────────────────────

function getChangedFiles() {
  try {
    return execSync("git diff --name-only HEAD~1 HEAD", {
      cwd: projectRoot,
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function deployBackend() {
  log("DEPLOY", "Deploying backend to Railway...");
  const result = spawnSync("railway", ["redeploy", "--yes"], {
    cwd: backendDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    log("FAIL", "railway redeploy failed");
    return false;
  }
  return waitForHealth(BACKEND_HEALTH, "Railway backend", RAILWAY_WAIT_SEC);
}

async function deployFrontend() {
  log("DEPLOY", "Deploying frontend to Vercel...");
  const result = spawnSync("vercel", ["--prod", "--yes"], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    log("FAIL", "vercel --prod failed");
    return false;
  }
  await sleep(30_000);
  return waitForHealth(`${PROD_URL}/bos/health`, "Vercel proxy", 240);
}

async function deployIfNeeded() {
  if (SKIP_DEPLOY) {
    log("INFO", "SKIP_DEPLOY=1 — skipping deploy");
    return true;
  }
  const changed = getChangedFiles();
  const needsBackend = changed.some((f) => f.startsWith("backend/"));
  const needsFrontend =
    changed.some((f) => f.startsWith("repo-b/")) || changed.length === 0;

  if (needsBackend) {
    const ok = await deployBackend();
    if (!ok) return false;
  }
  if (needsFrontend) {
    const ok = await deployFrontend();
    if (!ok) return false;
  }
  return true;
}

// ─── Backend eval ─────────────────────────────────────────────────────────────

function runBackendEval(cycle) {
  log("INFO", `Running backend eval (suite=${EVAL_SUITE}, cycle=${cycle})`);
  const result = spawnSync(
    "python",
    ["-m", "eval_loop.runner", `--${EVAL_SUITE}`, "--cycle", String(cycle)],
    {
      cwd: projectRoot,
      stdio: "inherit",
      env: { ...process.env },
      timeout: 300_000, // 5 min
    }
  );
  const passed = result.status === 0;
  log(
    passed ? "PASS" : "FAIL",
    `Backend eval ${passed ? "PASSED" : "FAILED"} (exit ${result.status})`
  );
  return passed;
}

// ─── Frontend Playwright eval ─────────────────────────────────────────────────

function runFrontendEval(cycle) {
  log("INFO", `Running Playwright frontend eval (cycle=${cycle})`);
  mkdirSync(frontendArtifactsDir, { recursive: true });
  const result = spawnSync(
    "npx",
    [
      "playwright",
      "test",
      "tests/ai-evals/ai-eval.spec.ts",
      "--config",
      "playwright.config.ts",
      "--project",
      "chromium",
    ],
    {
      cwd: repoB,
      stdio: "inherit",
      env: {
        ...process.env,
        PW_RUN_ID: `eval_cycle_${cycle}_${Date.now()}`,
      },
      timeout: 600_000, // 10 min
    }
  );
  const passed = result.status === 0;
  log(
    passed ? "PASS" : "FAIL",
    `Frontend eval ${passed ? "PASSED" : "FAILED"} (exit ${result.status})`
  );
  return passed;
}

// ─── Combined report ──────────────────────────────────────────────────────────

function writeCycleReport(cycle, backendPassed, frontendPassed) {
  const ts = new Date().toISOString();
  const reportPath = path.join(
    artifactsDir,
    `cycle_${cycle}_${Date.now()}.md`
  );

  // Read backend summary if available
  let backendSummary = "No backend eval results.";
  const summaryPath = path.join(artifactsDir, "latest_summary.md");
  if (existsSync(summaryPath)) {
    backendSummary = readFileSync(summaryPath, "utf-8");
  }

  // Read frontend results if available
  let frontendSummary = "No frontend eval results.";
  const frontendResultsPath = path.join(
    frontendArtifactsDir,
    "ai-eval-results.json"
  );
  if (existsSync(frontendResultsPath)) {
    try {
      const data = JSON.parse(readFileSync(frontendResultsPath, "utf-8"));
      const cases = Array.isArray(data) ? data : data.cases || [];
      const total = cases.length;
      const passed = cases.filter((c) => c.passed).length;
      const failed = cases.filter((c) => !c.passed);
      frontendSummary = [
        `- Total: ${total}`,
        `- Passed: ${passed}/${total}`,
        ...failed.map(
          (c) => `- FAILED: ${c.id} (${c.env_slug})`
        ),
      ].join("\n");
    } catch {
      frontendSummary = "Failed to parse frontend results.";
    }
  }

  const report = [
    `# Eval Loop Cycle Report — Cycle ${cycle}`,
    "",
    `- Timestamp: ${ts}`,
    `- Backend eval: ${backendPassed ? "PASSED" : "FAILED"}`,
    `- Frontend eval: ${frontendPassed === null ? "SKIPPED" : frontendPassed ? "PASSED" : "FAILED"}`,
    `- Deploy: ${SKIP_DEPLOY ? "SKIPPED" : "executed"}`,
    "",
    "## Backend Eval Summary",
    "",
    backendSummary,
    "",
    "## Frontend Eval Summary",
    "",
    frontendSummary,
    "",
  ].join("\n");

  writeFileSync(reportPath, report);
  log("INFO", `Cycle report written to: ${reportPath}`);
  return reportPath;
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function main() {
  log("INFO", "Winston eval loop starting");
  log("INFO", `  Max iterations: ${MAX_ITERATIONS}`);
  log("INFO", `  Suite: ${EVAL_SUITE}`);
  log("INFO", `  Skip deploy: ${SKIP_DEPLOY}`);
  log("INFO", `  Skip frontend: ${SKIP_FRONTEND}`);
  log("INFO", `  Skip backend: ${SKIP_BACKEND}`);

  for (let cycle = 1; cycle <= MAX_ITERATIONS; cycle++) {
    log("INFO", `\n${"─".repeat(60)}`);
    log("INFO", `Cycle ${cycle} of ${MAX_ITERATIONS}`);

    // Step 1: Local backend eval
    let backendPassed = true;
    if (!SKIP_BACKEND) {
      backendPassed = runBackendEval(cycle);
    }

    // Step 2: Deploy if this is not the first cycle (first is usually pre-deployed)
    if (cycle > 1) {
      const deployOk = await deployIfNeeded();
      if (!deployOk) {
        log("FAIL", `Deploy failed on cycle ${cycle}`);
        writeCycleReport(cycle, backendPassed, null);
        process.exit(1);
      }
    }

    // Step 3: Frontend Playwright eval (against deployed site)
    let frontendPassed = null;
    if (!SKIP_FRONTEND) {
      frontendPassed = runFrontendEval(cycle);
    }

    // Step 4: Write combined cycle report
    const reportPath = writeCycleReport(cycle, backendPassed, frontendPassed);

    // Step 5: Assess and continue
    const allPassed =
      backendPassed && (frontendPassed === null || frontendPassed);

    if (allPassed) {
      log("PASS", `All evals passed on cycle ${cycle}`);
      if (cycle < MAX_ITERATIONS) {
        log("INFO", "Continuing to next cycle for stability verification...");
        await sleep(5_000);
      } else {
        log("PASS", "Loop complete. All cycles passed.");
        process.exit(0);
      }
    } else {
      log("FAIL", `Eval failures on cycle ${cycle}`);
      log("INFO", `Report: ${reportPath}`);
      if (cycle < MAX_ITERATIONS) {
        log(
          "INFO",
          `Waiting 30s before cycle ${cycle + 1} (fix and commit to retry)...`
        );
        await sleep(30_000);
      } else {
        log(
          "FAIL",
          `Reached MAX_ITERATIONS=${MAX_ITERATIONS} with failures.`
        );
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
