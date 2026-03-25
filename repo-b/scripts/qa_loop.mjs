#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const maxRuns = Number(process.env.QA_LOOP_MAX_RUNS || "0");
const intervalSec = Number(process.env.QA_LOOP_INTERVAL_SEC || "15");
const config = process.env.QA_PLAYWRIGHT_CONFIG || "playwright.local.config.ts";
const spec = process.env.QA_SPEC || "tests/reports-qa.spec.ts";

const artifactsDir = path.join(process.cwd(), "tests", "artifacts");
fs.mkdirSync(artifactsDir, { recursive: true });

let run = 0;
while (true) {
  run += 1;
  const ts = new Date().toISOString();
  console.log(`\n[qa:loop] Run #${run} @ ${ts}`);

  const result = spawnSync("npx", ["playwright", "test", spec, "--config", config], {
    stdio: "inherit",
    env: {
      ...process.env,
      PLAYWRIGHT_JUNIT_OUTPUT_NAME: path.join(artifactsDir, `junit-run-${run}.xml`),
    },
  });

  if (result.status === 0) {
    console.log(`[qa:loop] Run #${run}: PASS`);
  } else {
    console.log(`[qa:loop] Run #${run}: FAIL (exit ${result.status})`);
    console.log("[qa:loop] Evidence saved under tests/artifacts and playwright-report.");
  }

  if (maxRuns > 0 && run >= maxRuns) {
    console.log(`[qa:loop] Reached QA_LOOP_MAX_RUNS=${maxRuns}; stopping.`);
    process.exit(result.status ?? 1);
  }

  await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
}
