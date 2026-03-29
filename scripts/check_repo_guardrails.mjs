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
    const match = file.match(/^(\d{3})[^/]*\.sql$/);
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
    if (!file.endsWith("/page.tsx")) continue;
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

async function buildSnapshot() {
  return {
    schema_duplicate_prefixes: await collectSchemaDuplicatePrefixes(),
    page_local_api_base_files: await collectPageLocalApiBaseFiles(),
    global_this_server_files: await collectGlobalThisServerFiles(),
    direct_db_route_files: await collectDirectDbRouteFiles(),
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
