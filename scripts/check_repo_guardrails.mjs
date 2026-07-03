import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "scripts", "repo_guardrails.baseline.json");
const WRITE_BASELINE = process.argv.includes("--write-baseline");

function normalize(filePath) {
  return filePath.split(path.sep).join("/");
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function collectSchemaDuplicatePrefixes() {
  const schemaDir = path.join(ROOT, "repo-b", "db", "schema");
  const files = await fs.readdir(schemaDir);
  const counts = new Map();
  for (const file of files) {
    // Capture the full numeric prefix before the first underscore. A fixed
    // \d{4} window silently skipped 3-digit prefixes and collapsed 5-digit
    // prefixes (10000, 10001, ...) onto a shared "1000" — a false duplicate.
    const match = file.match(/^(\d+)_.*\.sql$/);
    if (!match) continue;
    counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([prefix]) => prefix)
    .sort();
}

async function collectPageLocalApiBaseFiles() {
  const appDir = path.join(ROOT, "repo-b", "src", "app");
  const files = await walk(appDir);
  const matches = [];
  for (const file of files) {
    // normalize() first: walk() yields backslash paths on Windows, where a
    // "/page.tsx" suffix check silently matches nothing (and a --write-baseline
    // run there would clobber the real entries).
    if (!normalize(file).endsWith("/page.tsx")) continue;
    const text = await readIfExists(file);
    if (text.includes("NEXT_PUBLIC_BOS_API_URL") || text.includes("const API_BASE =")) {
      matches.push(normalize(path.relative(ROOT, file)));
    }
  }
  return matches.sort();
}

async function collectGlobalThisServerFiles() {
  const roots = [
    path.join(ROOT, "repo-b", "src", "lib", "server"),
    path.join(ROOT, "repo-b", "src", "app", "api"),
  ];
  const matches = [];
  for (const root of roots) {
    const files = await walk(root);
    for (const file of files) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      const text = await readIfExists(file);
      if (text.includes("globalThis.")) {
        matches.push(normalize(path.relative(ROOT, file)));
      }
    }
  }
  return [...new Set(matches)].sort();
}

async function collectDirectDbRouteFiles() {
  const apiDir = path.join(ROOT, "repo-b", "src", "app", "api");
  const files = await walk(apiDir);
  const matches = [];
  for (const file of files) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
    if (file.includes(".test.")) continue;
    const text = await readIfExists(file);
    if (
      text.includes("getPool(") ||
      text.includes("resolveBusinessId(") ||
      text.includes('from "pg"') ||
      text.includes("from 'pg'")
    ) {
      matches.push(normalize(path.relative(ROOT, file)));
    }
  }
  return matches.sort();
}

// Tracked instruction/knowledge surfaces must never contain credential-shaped
// values (Story #758: an invite code and the admin password were committed in
// docs/ and skills/). Names of env vars are fine; values are not. Findings are
// reported redacted (first 4 chars + length), never the full token.
const SECRET_DOC_ROOTS = ["docs", "skills", ".skills", "agents"];

const KNOWN_CREDENTIAL_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}\b/g, // OpenAI-style
  /\beyJ[A-Za-z0-9_-]{20,}\./g, // JWT header
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key
  /\bghp_[A-Za-z0-9]{30,}\b/g, // GitHub PAT (classic)
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, // GitHub PAT (fine-grained)
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // Slack
  /\bAIza[0-9A-Za-z_-]{30,}\b/g, // Google API key
];

function isEnvVarName(token) {
  // NOVENDOR_ADMIN_PASSWORD-style names: uppercase + digits + underscores only.
  return /^[A-Z0-9_]+$/.test(token);
}

function looksSecretShaped(token) {
  // Mixed-case token with a digit or underscore and no separators that would
  // mark it as a model id, URL, or path (hyphen/dot/slash/colon/@). Catches
  // invite-code-shaped strings while passing identifiers: env var NAMES have
  // no lowercase, and code identifiers (camelCase/snake_case/prefixed ids like
  // dpl_/prj_/getReV2...) start with a lowercase letter.
  if (token.length < 14) return false;
  if (isEnvVarName(token)) return false;
  if (/^[a-z]/.test(token)) return false;
  return /[a-z]/.test(token) && /[A-Z]/.test(token) && /[0-9_]/.test(token);
}

function redact(token) {
  // ASCII-only so baseline entries survive cross-platform tooling round-trips.
  return `${token.slice(0, 4)}...(${token.length})`;
}

async function collectSecretShapedDocValues() {
  const findings = [];
  for (const rootName of SECRET_DOC_ROOTS) {
    const rootDir = path.join(ROOT, rootName);
    let files;
    try {
      files = await walk(rootDir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const text = await readIfExists(file);
      const rel = normalize(path.relative(ROOT, file));

      for (const pattern of KNOWN_CREDENTIAL_PATTERNS) {
        for (const match of text.matchAll(pattern)) {
          findings.push(`${rel}::known-credential::${redact(match[0])}`);
        }
      }

      // Backticked mixed-entropy tokens (invite-code shaped).
      for (const match of text.matchAll(/`([A-Za-z0-9_]{14,})`/g)) {
        if (looksSecretShaped(match[1])) {
          findings.push(`${rel}::token-shaped::${redact(match[1])}`);
        }
      }

      // Password lines carrying a backticked literal that looks like an
      // actual password value (not an env var NAME, placeholder, email,
      // path/URL, or prose). Real passwords carry a digit or a symbol.
      for (const line of text.split("\n")) {
        if (!/password/i.test(line)) continue;
        const literal = line.match(/`([^`]{6,})`/);
        if (!literal) continue;
        const value = literal[1];
        if (isEnvVarName(value)) continue;
        if (/^[<[$*]/.test(value) || /env var|vercel env|pull/i.test(line)) continue;
        if (/[/@\s]/.test(value)) continue; // paths, URLs, emails, prose
        if (!/[0-9]/.test(value) && !/[^A-Za-z0-9_-]/.test(value)) continue; // no digit and no symbol -> not password-shaped
        findings.push(`${rel}::password-literal::${redact(value)}`);
      }
    }
  }
  return [...new Set(findings)].sort();
}

async function buildSnapshot() {
  return {
    schema_duplicate_prefixes: await collectSchemaDuplicatePrefixes(),
    page_local_api_base_files: await collectPageLocalApiBaseFiles(),
    global_this_server_files: await collectGlobalThisServerFiles(),
    direct_db_route_files: await collectDirectDbRouteFiles(),
    secret_shaped_doc_values: await collectSecretShapedDocValues(),
  };
}

function diffNewEntries(current = [], baseline = []) {
  const allowed = new Set(baseline);
  return current.filter((item) => !allowed.has(item)).sort();
}

async function main() {
  const snapshot = await buildSnapshot();
  if (WRITE_BASELINE) {
    await fs.writeFile(BASELINE_PATH, JSON.stringify(snapshot, null, 2) + "\n");
    console.log(`Wrote guardrail baseline to ${normalize(path.relative(ROOT, BASELINE_PATH))}`);
    return;
  }

  let baseline;
  try {
    baseline = JSON.parse(await fs.readFile(BASELINE_PATH, "utf8"));
  } catch {
    console.error("Guardrail baseline missing. Run: node scripts/check_repo_guardrails.mjs --write-baseline");
    process.exit(1);
  }

  const categories = [
    ["schema_duplicate_prefixes", "new duplicate schema prefixes"],
    ["page_local_api_base_files", "new page-local API base usage"],
    ["global_this_server_files", "new globalThis server stores"],
    ["direct_db_route_files", "new direct DB route handlers"],
    ["secret_shaped_doc_values", "credential-shaped values in tracked instruction/knowledge files (values belong in Vercel/Railway env stores, never in docs/skills/agents)"],
  ];

  let hasFailures = false;
  for (const [key, label] of categories) {
    const extras = diffNewEntries(snapshot[key], baseline[key]);
    if (!extras.length) continue;
    hasFailures = true;
    console.error(`Guardrail failure: ${label}`);
    for (const extra of extras) {
      console.error(`  - ${extra}`);
    }
  }

  if (hasFailures) {
    process.exit(1);
  }

  console.log("Repo guardrails passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
