/**
 * validate_harness_runtime.mjs
 *
 * Validates the Winston harness layer exists and is correctly structured.
 * Run alongside validate_assistant_runtime.mjs as part of the CI guardrails.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const REQUIRED_HARNESS_MODULES = [
  "backend/app/assistant_runtime/harness/__init__.py",
  "backend/app/assistant_runtime/harness/harness_types.py",
  "backend/app/assistant_runtime/harness/quality_gate.py",
  "backend/app/assistant_runtime/harness/lifecycle.py",
  "backend/app/assistant_runtime/harness/loop_controller.py",
  "backend/app/assistant_runtime/harness/audit_logger.py",
];

const REQUIRED_SKILL_FIELDS = [
  "requires_quality_gate",
  "preferred_loop_pattern",
  "max_tool_calls",
];

const REQUIRED_RECEIPT_FIELDS = [
  "inherited_entity_id",
  "inherited_entity_source",
  "quality_gates",
];

const MIN_EVAL_CASES = 15;

let failures = 0;

function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  failures++;
}

function pass(msg) {
  console.log(`  OK: ${msg}`);
}

async function fileExists(relPath) {
  try {
    await fs.access(path.join(ROOT, relPath));
    return true;
  } catch {
    return false;
  }
}

async function readFile(relPath) {
  try {
    return await fs.readFile(path.join(ROOT, relPath), "utf8");
  } catch {
    return "";
  }
}

async function main() {
  console.log("Validating Winston harness runtime...\n");

  // 1. Check harness modules exist
  console.log("Harness modules:");
  for (const mod of REQUIRED_HARNESS_MODULES) {
    if (await fileExists(mod)) {
      pass(mod);
    } else {
      fail(`Missing harness module: ${mod}`);
    }
  }

  // 2. Check SkillDefinition has harness metadata fields (defined in turn_receipts.py)
  console.log("\nSkill definition harness metadata:");
  const skillDefSource = await readFile("backend/app/assistant_runtime/turn_receipts.py");
  for (const field of REQUIRED_SKILL_FIELDS) {
    if (skillDefSource.includes(field)) {
      pass(`SkillDefinition contains ${field}`);
    } else {
      fail(`SkillDefinition missing ${field}`);
    }
  }

  // 3. Check turn_receipts has new fields
  console.log("\nTurn receipt extensions:");
  const receiptSource = await readFile("backend/app/assistant_runtime/turn_receipts.py");
  for (const field of REQUIRED_RECEIPT_FIELDS) {
    if (receiptSource.includes(field)) {
      pass(`turn_receipts.py contains ${field}`);
    } else {
      fail(`turn_receipts.py missing ${field}`);
    }
  }

  // 4. Check frontend types mirror new fields
  console.log("\nFrontend type mirroring:");
  const typesSource = await readFile("repo-b/src/lib/commandbar/types.ts");
  const frontendFields = ["inherited_entity_id", "inherited_entity_source", "quality_gates", "requires_quality_gate"];
  for (const field of frontendFields) {
    if (typesSource.includes(field)) {
      pass(`types.ts contains ${field}`);
    } else {
      fail(`types.ts missing ${field}`);
    }
  }

  // 5. Check eval case count
  console.log("\nEval case coverage:");
  try {
    const evalCases = JSON.parse(await readFile("repo-b/tests/ai-evals/eval-cases.json"));
    if (evalCases.length >= MIN_EVAL_CASES) {
      pass(`${evalCases.length} eval cases (minimum: ${MIN_EVAL_CASES})`);
    } else {
      fail(`Only ${evalCases.length} eval cases (minimum: ${MIN_EVAL_CASES})`);
    }

    // Check for clarification regression case
    const hasCarryForward = evalCases.some(c => c.id.includes("clarification-carryforward"));
    if (hasCarryForward) {
      pass("Clarification carry-forward regression case exists");
    } else {
      fail("Missing clarification carry-forward regression case");
    }
  } catch {
    fail("Could not parse eval-cases.json");
  }

  // 6. Check thread_entity_state support in conversations service
  console.log("\nThread entity state:");
  const convoSource = await readFile("backend/app/services/ai_conversations.py");
  if (convoSource.includes("thread_entity_state")) {
    pass("ai_conversations.py supports thread_entity_state");
  } else {
    fail("ai_conversations.py missing thread_entity_state support");
  }

  // Summary
  console.log(`\n${failures === 0 ? "Harness validation passed." : `Harness validation failed with ${failures} issue(s).`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
