import fs from "node:fs";
import path from "node:path";

const REQUIRED_FIELDS = [
  "id",
  "kind",
  "status",
  "source_of_truth",
  "topic",
  "owners",
  "intent_tags",
  "triggers",
  "entrypoint",
  "handoff_to",
  "when_to_use",
  "when_not_to_use",
];

const OPTIONAL_ARRAY_FIELDS = new Set([
  "surface_paths",
  "commands",
  "aliases",
  "depends_on",
  "supersedes",
  "notes",
]);

const REQUIRED_ARRAY_FIELDS = new Set([
  "owners",
  "intent_tags",
  "triggers",
  "handoff_to",
]);

const ALLOWED_KINDS = new Set(["router", "agent", "skill", "playbook", "prompt", "reference"]);
const ALLOWED_STATUSES = new Set(["active", "deprecated", "archived"]);
const ROUTER_ID = "claude-router";

const INTENT_PATTERNS = {
  build: [
    /\b(implement|build|fix|bug|feature|endpoint|component|page|wire up|change|refactor)\b/i,
  ],
  bugfix: [/\b(fix|bug|regression|broken|repair)\b/i],
  research: [/\b(research|architecture|architect|audit|plan|inventory|map|design)\b/i],
  qa: [/\b(qa|test|regression|verify|validation|smoke)\b/i],
  deploy: [/\b(push|deploy|ship it|release|vercel|railway|production)\b/i],
  sync: [/\b(sync|pull|fetch|rebase|git status|dirty tree|up to date|incoming commits)\b/i],
  data: [/\b(schema|migration|sql|supabase|etl|seed|database|backfill)\b/i],
  docs: [/\b(doc|docs|prompt|playbook|guide|readme|instruction)\b/i],
  ops: [/\b(proposal|brief|cost|outreach|content|demo|status|operator|telegram)\b/i],
};

const OWNER_PATTERNS = {
  backend: [/\bbackend\//i, /\bfastapi\b/i, /\bbos backend\b/i],
  "repo-b": [/\brepo-b\//i, /\bnext\.js\b/i, /\bfrontend\b/i],
  "repo-c": [/\brepo-c\//i, /\bdemo lab\b/i],
  "excel-addin": [/\bexcel-addin\//i, /\bexcel add-?in\b/i],
  orchestration: [/\borchestration\//i, /\blobster\b/i, /\bworkflow\b/i],
  scripts: [/\bscripts\//i, /\bscript\b/i],
  docs: [/\bdocs\//i, /\bprompt\b/i, /\bplaybook\b/i, /\binstruction\b/i],
  supabase: [/\bsupabase\//i, /\bsupabase\b/i],
};

function isRoutedDoc(relativePath) {
  return (
    relativePath === "CLAUDE.md" ||
    relativePath === "docs/instruction-index.md" ||
    (relativePath.startsWith("agents/") && relativePath.endsWith(".md")) ||
    (relativePath.startsWith("skills/") && relativePath.endsWith(".md")) ||
    (relativePath.startsWith(".skills/") && relativePath.endsWith(".md")) ||
    /^docs\/WINSTON_.*PROMPT.*\.md$/.test(relativePath) ||
    /^docs\/plans\/.*META_PROMPT.*\.md$/.test(relativePath)
  );
}

function walk(relativeDir, rootDir, results) {
  const absoluteDir = path.join(rootDir, relativeDir);
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      walk(relativePath, rootDir, results);
      continue;
    }
    if (isRoutedDoc(relativePath)) {
      results.push(relativePath);
    }
  }
}

function splitInlineArray(text) {
  const values = [];
  let current = "";
  let quote = null;
  for (const char of text) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ",") {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    values.push(current.trim());
  }
  return values;
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "[]") return [];
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return splitInlineArray(inner).map((entry) => parseScalar(entry));
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseFrontMatter(content, relativePath = "<unknown>") {
  if (!content.startsWith("---\n")) {
    throw new Error(`${relativePath}: missing YAML front matter opening delimiter`);
  }
  const closing = content.indexOf("\n---\n", 4);
  if (closing === -1) {
    throw new Error(`${relativePath}: missing YAML front matter closing delimiter`);
  }
  const frontMatter = content.slice(4, closing);
  const body = content.slice(closing + 5);
  const metadata = {};
  let currentKey = null;

  for (const rawLine of frontMatter.split(/\r?\n/)) {
    if (!rawLine.trim()) {
      continue;
    }
    const keyMatch = rawLine.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
    if (keyMatch) {
      const [, key, value] = keyMatch;
      if (!value) {
        metadata[key] = [];
        currentKey = key;
      } else {
        metadata[key] = parseScalar(value);
        currentKey = null;
      }
      continue;
    }
    const listMatch = rawLine.match(/^\s*-\s*(.+)$/);
    if (listMatch && currentKey) {
      metadata[currentKey].push(parseScalar(listMatch[1]));
      continue;
    }
    throw new Error(`${relativePath}: unsupported front matter line "${rawLine}"`);
  }

  return { metadata, body };
}

export function listRoutedDocs(rootDir = process.cwd()) {
  const results = ["CLAUDE.md"];
  for (const relativeDir of ["agents", "skills", ".skills", "docs"]) {
    walk(relativeDir, rootDir, results);
  }
  return [...new Set(results)].sort();
}

export function loadRoutedDocs(rootDir = process.cwd()) {
  return listRoutedDocs(rootDir).map((relativePath) => {
    const absolutePath = path.join(rootDir, relativePath);
    const content = fs.readFileSync(absolutePath, "utf8");
    const { metadata, body } = parseFrontMatter(content, relativePath);
    return {
      absolutePath,
      relativePath,
      metadata,
      body,
    };
  });
}

function validateMetadataShape(doc) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (!(field in doc.metadata)) {
      errors.push(`${doc.relativePath}: missing required field "${field}"`);
    }
  }

  if (doc.metadata.kind && !ALLOWED_KINDS.has(doc.metadata.kind)) {
    errors.push(`${doc.relativePath}: invalid kind "${doc.metadata.kind}"`);
  }

  if (doc.metadata.status && !ALLOWED_STATUSES.has(doc.metadata.status)) {
    errors.push(`${doc.relativePath}: invalid status "${doc.metadata.status}"`);
  }

  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (field in doc.metadata && !Array.isArray(doc.metadata[field])) {
      errors.push(`${doc.relativePath}: field "${field}" must be an array`);
    }
  }

  for (const field of OPTIONAL_ARRAY_FIELDS) {
    if (field in doc.metadata && !Array.isArray(doc.metadata[field])) {
      errors.push(`${doc.relativePath}: field "${field}" must be an array when present`);
    }
  }

  if ("source_of_truth" in doc.metadata && typeof doc.metadata.source_of_truth !== "boolean") {
    errors.push(`${doc.relativePath}: field "source_of_truth" must be boolean`);
  }

  if ("entrypoint" in doc.metadata && typeof doc.metadata.entrypoint !== "boolean") {
    errors.push(`${doc.relativePath}: field "entrypoint" must be boolean`);
  }

  if (doc.metadata.entrypoint && doc.metadata.status === "archived") {
    errors.push(`${doc.relativePath}: archived docs cannot be entrypoints`);
  }

  return errors;
}

export function validateInstructionDocs(rootDir = process.cwd()) {
  const docs = loadRoutedDocs(rootDir);
  const errors = [];
  const ids = new Map();
  const truthByTopic = new Map();

  for (const doc of docs) {
    errors.push(...validateMetadataShape(doc));
    if (doc.metadata.id) {
      const previous = ids.get(doc.metadata.id);
      if (previous) {
        errors.push(`${doc.relativePath}: duplicate id "${doc.metadata.id}" also used by ${previous}`);
      } else {
        ids.set(doc.metadata.id, doc.relativePath);
      }
    }
  }

  for (const doc of docs) {
    for (const handoffId of doc.metadata.handoff_to || []) {
      if (!ids.has(handoffId)) {
        errors.push(`${doc.relativePath}: handoff_to references unknown id "${handoffId}"`);
      }
    }
    if (doc.metadata.source_of_truth) {
      const existing = truthByTopic.get(doc.metadata.topic);
      if (existing) {
        errors.push(
          `${doc.relativePath}: topic "${doc.metadata.topic}" already has source_of_truth=true in ${existing}`,
        );
      } else {
        truthByTopic.set(doc.metadata.topic, doc.relativePath);
      }
    }
  }

  const indexDoc = docs.find((doc) => doc.relativePath === "docs/instruction-index.md");
  if (!indexDoc) {
    errors.push("docs/instruction-index.md: missing routed instruction index");
  } else {
    const indexText = fs.readFileSync(path.join(rootDir, "docs/instruction-index.md"), "utf8");
    for (const doc of docs) {
      if (!indexText.includes(doc.metadata.id) || !indexText.includes(doc.relativePath)) {
        errors.push(
          `docs/instruction-index.md: missing registry row for ${doc.metadata.id} (${doc.relativePath})`,
        );
      }
    }
  }

  return { docs, errors };
}

function inferIntents(text) {
  const matches = new Set();
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(text))) {
      matches.add(intent);
    }
  }
  return matches;
}

function inferOwners(text, mentionedPath = "") {
  const combined = `${text} ${mentionedPath}`.toLowerCase();
  const matches = new Set();
  for (const [owner, patterns] of Object.entries(OWNER_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(combined))) {
      matches.add(owner);
    }
  }
  return matches;
}

function explicitMentions(text, doc) {
  const phrases = [
    doc.metadata.id,
    ...(doc.metadata.triggers || []),
    ...(doc.metadata.commands || []),
    ...(doc.metadata.aliases || []),
    doc.metadata.name || "",
  ]
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);

  return phrases.filter((phrase) => text.includes(phrase));
}

function hasSurfacePathMatch(mentionedPath, doc) {
  const pathText = String(mentionedPath || "").toLowerCase();
  return (doc.metadata.surface_paths || []).some((surfacePath) =>
    pathText.includes(String(surfacePath).toLowerCase()),
  );
}

function scoreDoc(doc, normalizedText, signals) {
  if (!doc.metadata.entrypoint || doc.metadata.status !== "active") {
    return { score: -1, reasons: [] };
  }

  const reasons = [];
  let score = 0;

  const mentions = explicitMentions(normalizedText, doc);
  if (mentions.length > 0) {
    score += 120;
    reasons.push(`explicit:${mentions[0]}`);
  }

  if (hasSurfacePathMatch(signals.mentionedPath, doc)) {
    score += 55;
    reasons.push("surface-path");
  }

  const ownerOverlap = (doc.metadata.owners || []).filter((owner) => signals.owners.has(owner));
  if (ownerOverlap.length > 0) {
    score += ownerOverlap.length * 20;
    reasons.push(`owner:${ownerOverlap.join(",")}`);
  }

  const intentOverlap = (doc.metadata.intent_tags || []).filter((intent) => signals.intents.has(intent));
  if (intentOverlap.length > 0) {
    score += intentOverlap.length * 18;
    reasons.push(`intent:${intentOverlap.join(",")}`);
  }

  if (doc.metadata.source_of_truth) {
    score += 5;
  }

  return { score, reasons };
}

export function resolveInstructionRoute(
  message,
  { mentionedPath = "", rootDir = process.cwd() } = {},
) {
  const docs = loadRoutedDocs(rootDir);
  const normalizedText = `${message} ${mentionedPath}`.toLowerCase();
  const signals = {
    mentionedPath,
    intents: inferIntents(normalizedText),
    owners: inferOwners(normalizedText, mentionedPath),
  };

  const candidates = docs
    .map((doc) => ({ doc, ...scoreDoc(doc, normalizedText, signals) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.doc.metadata.source_of_truth !== right.doc.metadata.source_of_truth) {
        return left.doc.metadata.source_of_truth ? -1 : 1;
      }
      return left.doc.metadata.id.localeCompare(right.doc.metadata.id);
    });

  const routerDoc = docs.find((doc) => doc.metadata.id === ROUTER_ID);
  const top = candidates[0];
  const second = candidates[1];
  const strongWinner =
    top &&
    (top.reasons.some((reason) => reason.startsWith("explicit:")) ||
      top.reasons.includes("surface-path") ||
      top.score >= 80);

  const ambiguous =
    !top ||
    (!strongWinner && top.score < 40) ||
    (!strongWinner && second && top.score - second.score < 12);

  const primaryDoc = ambiguous ? routerDoc : top.doc;
  const supportingDocs = (primaryDoc.metadata.handoff_to || [])
    .map((id) => docs.find((doc) => doc.metadata.id === id))
    .filter(Boolean)
    .slice(0, 2);

  return {
    primaryId: primaryDoc.metadata.id,
    primaryPath: primaryDoc.relativePath,
    supportingIds: supportingDocs.map((doc) => doc.metadata.id),
    needsClarification: primaryDoc.metadata.id === ROUTER_ID && ambiguous,
    candidates: candidates.slice(0, 5).map((candidate) => ({
      id: candidate.doc.metadata.id,
      score: candidate.score,
      reasons: candidate.reasons,
    })),
  };
}
