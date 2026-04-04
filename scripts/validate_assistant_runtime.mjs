import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function exists(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath));
}

const errors = [];

const instructionIndexPath = "docs/instruction-index.md";
const instructionIndex = read(instructionIndexPath);
if (!instructionIndex.includes("source_of_truth: false")) {
  errors.push(`${instructionIndexPath} must be marked source_of_truth: false`);
}
if (!instructionIndex.includes("status: informational")) {
  errors.push(`${instructionIndexPath} must be marked status: informational`);
}

const skillDocPaths = [...instructionIndex.matchAll(/`([^`]+SKILL\.md)`/g)].map((match) => match[1]);
for (const skillPath of skillDocPaths) {
  if (!exists(skillPath)) {
    errors.push(`Instruction index references missing skill doc: ${skillPath}`);
  }
}

const promptFiles = [
  "backend/app/assistant_runtime/prompts/system_base.txt",
  "backend/app/assistant_runtime/prompts/skill_explain_metric.txt",
  "backend/app/assistant_runtime/prompts/skill_analysis.txt",
  "backend/app/assistant_runtime/prompts/skill_lookup_entity.txt",
  "backend/app/assistant_runtime/prompts/skill_generate_lp_summary.txt",
  "backend/app/assistant_runtime/prompts/skill_create_entity.txt",
];
for (const promptPath of promptFiles) {
  if (!exists(promptPath)) {
    errors.push(`Missing assistant runtime prompt file: ${promptPath}`);
  }
}

for (const legacyRoot of ["claw-code-main", "TaxHacker-main", "pretext-main"]) {
  if (exists(legacyRoot)) {
    errors.push(`Legacy reference repo must not live at repo root: ${legacyRoot}`);
  }
  if (!exists(path.join("reference", legacyRoot))) {
    errors.push(`Missing quarantined reference repo: reference/${legacyRoot}`);
  }
}

if (!exists("memory/README.md")) {
  errors.push("memory/README.md must mark memory/ as archival");
}

const backendSkillRegistry = read("backend/app/assistant_runtime/skill_registry.py");
for (const skillId of [
  "lookup_entity",
  "explain_metric",
  "run_analysis",
  "generate_lp_summary",
  "create_entity",
]) {
  if (!backendSkillRegistry.includes(`id="${skillId}"`)) {
    errors.push(`skill_registry.py is missing canonical skill: ${skillId}`);
  }
}

const frontendTypes = read("repo-b/src/lib/commandbar/types.ts");
for (const typeName of [
  "export type Lane",
  "export type PermissionMode",
  "export type ContextReceipt",
  "export type SkillSelection",
  "export type ToolReceipt",
  "export type TurnReceipt",
]) {
  if (!frontendTypes.includes(typeName)) {
    errors.push(`Frontend assistant types are missing ${typeName}`);
  }
}

const evalCasesPath = "repo-b/tests/ai-evals/eval-cases.json";
if (!exists(evalCasesPath)) {
  errors.push(`Missing golden scenario file: ${evalCasesPath}`);
} else {
  const evalCases = JSON.parse(read(evalCasesPath));
  if (!Array.isArray(evalCases) || evalCases.length < 10) {
    errors.push(`Expected at least 10 golden assistant eval scenarios in ${evalCasesPath}`);
  }
}

if (errors.length > 0) {
  console.error(`Assistant runtime validation failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Assistant runtime validation passed.");
