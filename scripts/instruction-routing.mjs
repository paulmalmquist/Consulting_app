import fs from "node:fs";
import path from "node:path";

const REGISTRY_PATH = path.join("config", "instruction-routing.json");
const ROUTER_ID = "claude-router";
const REQUIRED_FIELDS = [
  "id",
  "kind",
  "status",
  "source",
  "owners",
  "paths",
  "intents",
  "triggers",
  "handoff_to",
  "claude_skill",
  "ado_risk",
  "delivery_profile",
  "entrypoint",
  "description",
];
const ARRAY_FIELDS = ["owners", "paths", "intents", "triggers", "handoff_to"];
const ALLOWED_KINDS = new Set(["router", "agent", "skill"]);
const ALLOWED_STATUSES = new Set(["active", "deprecated", "archived"]);
const ALLOWED_RISKS = new Set(["R0", "R1", "R2"]);
const ALLOWED_DELIVERY = new Set(["none", "verify", "full"]);

const INTENT_PATTERNS = {
  architecture: [/\b(architecture|audit|inspect|review|explain|trace|map)\b/i],
  planning: [/\b(plan|design|inventory|research)\b/i],
  build: [/\b(implement|build|fix|add|create|change|refactor|repair)\b/i],
  bugfix: [/\b(fix|bug|broken|regression|repair)\b/i],
  frontend: [/\b(frontend|next\.js|component|page|app shell)\b/i],
  backend: [/\b(backend|fastapi|route|service|domain logic)\b/i],
  lab: [/\b(lab|environment|telemetry|industry template|excel add-?in)\b/i],
  ai: [/\b(ai gateway|assistant|rag|prompt|model routing)\b/i],
  mcp: [/\b(mcp|tool schema|tool registry|permission policy|audit policy)\b/i],
  data: [/\b(schema|sql|database|etl|backfill)\b/i],
  schema: [/\b(schema|migration|table|rls)\b/i],
  migration: [/\b(apply|run|pending|push)\s+(the\s+)?migration\b/i],
  qa: [/\b(qa|test|regression|validate|verify|smoke)\b/i],
  deploy: [/\b(push|deploy|ship|release|railway|vercel|production)\b/i],
  sync: [/\b(sync|fetch|pull|incoming commits|up to date)\b/i],
  resume: [/\b(continue|resume|where you left off|selected the lines)\b/i],
  routing: [/\b(route this|which agent|harness|telegram)\b/i],
  work_item: [/\b(azure devops|ado|work item|session brief|ticket this)\b/i],
  infrastructure: [/\b(confluent|kafka|flink|cluster|cloud infrastructure)\b/i],
  delivery: [/\b(full delivery|land this|merge and verify|finish delivery)\b/i],
  cleanup: [/\b(clean the tree|tidy up|file away)\b/i],
  relay: [/\b(plan relay|handoff prompt|two-agent review|relay this)\b/i],
};

const R2_PATTERNS = [
  /\b(schema|migration|rls|security|auth|compliance)\b/i,
  /\b(mcp contract|tool schema|tool permission|audit policy)\b/i,
  /\b(confluent|kafka cluster|flink|cloud infrastructure|production data)\b/i,
  /\b(push|deploy|ship|release|railway|vercel|production)\b/i,
  /\b(claude\.md|agent governance|instruction routing|governance instruction)\b/i,
  /\b(multi-session|parallel implementation|cross-surface)\b/i,
];
const R0_PATTERNS = [
  /\b(explain|audit|inspect|review|trace|read-only|plan only|research|continue|resume)\b/i,
];
const MUTATION_PATTERNS = [
  /\b(implement|build|fix|add|create|change|improve|modify|refactor|apply|deploy|push)\b/i,
];

export function loadRoutingRegistry(rootDir = process.cwd()) {
  const registryPath = path.join(rootDir, REGISTRY_PATH);
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function phraseMatches(text, phrase) {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return false;
  const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\b)${escaped}(\\b|$)`, "i").test(text);
}

function inferIntents(text) {
  const intents = new Set();
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(text))) intents.add(intent);
  }
  return intents;
}

function inferAdoRisk(text) {
  if (R2_PATTERNS.some((pattern) => pattern.test(text))) return "R2";
  if (MUTATION_PATTERNS.some((pattern) => pattern.test(text))) return "R1";
  if (R0_PATTERNS.some((pattern) => pattern.test(text))) return "R0";
  return "R0";
}

function matchingPaths(route, mentionedPath, text) {
  const haystack = `${normalize(mentionedPath)} ${normalize(text)}`;
  return route.paths.filter((candidate) => haystack.includes(normalize(candidate)));
}

function scoreRoute(route, text, mentionedPath, intents, inferredRisk) {
  if (!route.entrypoint || route.status !== "active") return { score: -1, reasons: [] };

  const normalized = normalize(text);
  const reasons = [];
  let score = 0;

  const identity = [route.id, route.claude_skill]
    .filter(Boolean)
    .map(normalize)
    .find((value) => phraseMatches(normalized, value));
  if (identity) {
    score += 260;
    reasons.push(`identity:${identity}`);
  }

  const trigger = route.triggers
    .map(normalize)
    .find((value) => phraseMatches(normalized, value));
  if (trigger) {
    score += 120;
    reasons.push(`trigger:${trigger}`);
  }

  const paths = matchingPaths(route, mentionedPath, text);
  if (paths.length > 0) {
    const longest = Math.max(...paths.map((value) => value.length));
    score += 70 + Math.min(longest, 40);
    reasons.push(`path:${paths.sort((a, b) => b.length - a.length)[0]}`);
  }

  const intentMatches = route.intents.filter((intent) => intents.has(intent));
  if (intentMatches.length > 0) {
    score += intentMatches.length * 35;
    reasons.push(`intent:${intentMatches.join(",")}`);
  }

  if (intents.has("resume") && route.id === "winston-session-start") score += 80;
  if (intents.has("work_item") && route.id === "azure-devops-intake") score += 140;
  if (intents.has("deploy") && route.id === "deploy-winston") score += 80;
  if (intents.has("build") && route.id === "feature-dev") score += 60;
  if (intents.has("schema") && route.id === "data-winston") score += 60;
  if (inferredRisk === "R0" && intents.has("architecture") && route.id === "architect-winston") {
    score += 160;
  }

  return { score, reasons };
}

export function validateInstructionDocs(rootDir = process.cwd()) {
  const registry = loadRoutingRegistry(rootDir);
  const errors = [];
  const ids = new Map();
  const claudeSkills = new Map();

  if (registry.version !== 1 || !Array.isArray(registry.routes)) {
    return { docs: [], errors: ["config/instruction-routing.json: expected version 1 routes array"] };
  }

  for (const [index, route] of registry.routes.entries()) {
    const label = route.id || `route[${index}]`;
    for (const field of REQUIRED_FIELDS) {
      if (!(field in route)) errors.push(`${label}: missing required field "${field}"`);
    }
    for (const field of ARRAY_FIELDS) {
      if (field in route && !Array.isArray(route[field])) {
        errors.push(`${label}: field "${field}" must be an array`);
      }
    }
    if (!ALLOWED_KINDS.has(route.kind)) errors.push(`${label}: invalid kind "${route.kind}"`);
    if (!ALLOWED_STATUSES.has(route.status)) errors.push(`${label}: invalid status "${route.status}"`);
    if (!ALLOWED_RISKS.has(route.ado_risk)) errors.push(`${label}: invalid ado_risk "${route.ado_risk}"`);
    if (!ALLOWED_DELIVERY.has(route.delivery_profile)) {
      errors.push(`${label}: invalid delivery_profile "${route.delivery_profile}"`);
    }
    if (ids.has(route.id)) errors.push(`${label}: duplicate id also used by ${ids.get(route.id)}`);
    else ids.set(route.id, route.source);

    if (route.status === "active" && !fs.existsSync(path.join(rootDir, route.source))) {
      errors.push(`${label}: source does not exist: ${route.source}`);
    }
    if (route.claude_skill) {
      if (claudeSkills.has(route.claude_skill)) {
        errors.push(`${label}: duplicate claude_skill also used by ${claudeSkills.get(route.claude_skill)}`);
      } else {
        claudeSkills.set(route.claude_skill, route.id);
      }
      const wrapper = path.join(rootDir, ".claude", "skills", route.claude_skill, "SKILL.md");
      if (route.status === "active" && !fs.existsSync(wrapper)) {
        errors.push(`${label}: Claude skill wrapper does not exist: ${path.relative(rootDir, wrapper)}`);
      } else if (route.status === "active") {
        const wrapperText = fs.readFileSync(wrapper, "utf8");
        if (
          !wrapperText.includes("generated by scripts/generate_instruction_artifacts.mjs") ||
          !wrapperText.includes(route.description) ||
          !wrapperText.includes(route.source)
        ) {
          errors.push(`${label}: Claude skill wrapper is stale; run npm run generate:instructions`);
        }
      }
    }
  }

  for (const route of registry.routes) {
    for (const handoff of route.handoff_to || []) {
      if (!ids.has(handoff)) errors.push(`${route.id}: handoff_to references unknown id "${handoff}"`);
    }
  }

  const indexPath = path.join(rootDir, "docs", "instruction-index.md");
  if (!fs.existsSync(indexPath)) {
    errors.push("docs/instruction-index.md: missing generated instruction index");
  } else {
    const indexText = fs.readFileSync(indexPath, "utf8");
    for (const route of registry.routes.filter((item) => item.status === "active")) {
      if (!indexText.includes(`\`${route.id}\``) || !indexText.includes(`\`${route.source}\``)) {
        errors.push(`docs/instruction-index.md: missing generated row for ${route.id}`);
      }
    }
  }

  return { docs: registry.routes, errors };
}

export function resolveInstructionRoute(
  message,
  { mentionedPath = "", rootDir = process.cwd() } = {},
) {
  const registry = loadRoutingRegistry(rootDir);
  const text = `${message} ${mentionedPath}`;
  const intents = inferIntents(text);
  const inferredRisk = inferAdoRisk(text);
  const candidates = registry.routes
    .map((route) => ({
      route,
      ...scoreRoute(route, message, mentionedPath, intents, inferredRisk),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score || left.route.id.localeCompare(right.route.id));

  const crossSurfaceAmbiguous =
    !mentionedPath &&
    intents.has("frontend") &&
    intents.has("backend") &&
    !intents.has("build") &&
    !intents.has("architecture");
  const top = candidates[0];
  const second = candidates[1];
  const strong =
    top &&
    (top.score >= 70 || top.reasons.some((reason) => reason.startsWith("identity:")));
  const ambiguous =
    crossSurfaceAmbiguous || !top || !strong || (second && top.score - second.score < 15);
  const primary =
    (ambiguous && registry.routes.find((route) => route.id === ROUTER_ID)) || top.route;
  const riskOrder = { R0: 0, R1: 1, R2: 2 };
  const adoRisk =
    riskOrder[inferredRisk] > riskOrder[primary.ado_risk] ? inferredRisk : primary.ado_risk;

  return {
    primaryId: primary.id,
    primaryPath: primary.source,
    supportingIds: primary.handoff_to,
    owner: primary.owners[0] || "cross-repo",
    adoRisk,
    adoRequired: adoRisk === "R2",
    deliveryProfile: primary.delivery_profile,
    needsClarification: primary.id === ROUTER_ID && ambiguous,
    reasons: top?.reasons || [],
    candidates: candidates.slice(0, 5).map((candidate) => ({
      id: candidate.route.id,
      score: candidate.score,
      reasons: candidate.reasons,
    })),
  };
}
