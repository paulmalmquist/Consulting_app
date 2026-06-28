// Guard against the ".vercelignore unanchored folder" deploy trap.
//
// .vercelignore uses gitignore semantics: an UNANCHORED directory pattern like `audit/` (no leading
// `/`) matches a folder of that name at ANY depth. So a real shippable frontend folder such as
// `repo-b/src/app/lab/audit/` gets silently dropped from the Vercel deploy upload. If a page/route in
// that folder is imported elsewhere, the production build fails with `Module not found`; if it is just
// a route segment, the route silently 404s in prod. Either way:
//   - local `npm run build` PASSES (the files are present locally), and
//   - CI PASSES (the frontend job runs lint/typecheck/vitest, NOT `next build`),
// so the failure surfaces only at `vercel deploy`. This guard closes that gap.
//
// Rule: no UNANCHORED bare-directory pattern in .vercelignore may match a directory name that also
// exists anywhere under repo-b/src (the shippable frontend). Fix a violation by EITHER anchoring the
// pattern (`/name/` — excludes only the repo-root dir) OR renaming the colliding frontend folder.
//
// Exit 0 = clean, exit 1 = collision(s) found.

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const VERCELIGNORE = path.join(ROOT, ".vercelignore");
const FRONTEND_SRC = path.join(ROOT, "repo-b", "src");

/** Parse .vercelignore into the set of UNANCHORED bare-directory-name patterns. */
function parseUnanchoredDirPatterns(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue; // blank / comment
    if (line.startsWith("/") || line.startsWith("!")) continue; // anchored or negated — safe
    if (line.includes("*") || line.includes("?")) continue; // glob (e.g. *.zip) — not a dir-name match
    const name = line.replace(/\/$/, ""); // drop trailing slash
    if (!name || name.includes("/")) continue; // must be a bare single segment
    out.push(name);
  }
  return out;
}

/** Collect the set of directory names that exist anywhere under repo-b/src. */
async function collectDirNames(dir, acc = new Map()) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).split(path.sep).join("/");
    if (!acc.has(entry.name)) acc.set(entry.name, []);
    acc.get(entry.name).push(rel);
    await collectDirNames(full, acc);
  }
  return acc;
}

async function main() {
  const text = await fs.readFile(VERCELIGNORE, "utf8");
  const patterns = parseUnanchoredDirPatterns(text);
  const dirNames = await collectDirNames(FRONTEND_SRC);

  const violations = [];
  for (const name of patterns) {
    const hits = dirNames.get(name);
    if (hits && hits.length) violations.push({ name, hits });
  }

  if (violations.length === 0) {
    console.log(
      `[vercelignore-guard] OK — no unanchored .vercelignore pattern collides with repo-b/src ` +
        `(${patterns.length} bare-dir pattern(s) checked).`,
    );
    return;
  }

  console.error("[vercelignore-guard] FAIL — unanchored .vercelignore pattern(s) drop shippable frontend folders:\n");
  for (const v of violations) {
    console.error(`  pattern "${v.name}/" (unanchored) excludes these from the Vercel deploy upload:`);
    for (const h of v.hits) console.error(`    - ${h}`);
  }
  console.error(
    "\nFix: anchor the pattern to the repo root (`/" + violations[0].name + "/`) so it only excludes the\n" +
      "top-level directory, OR rename the colliding frontend folder. This is invisible to `npm run build`\n" +
      "and CI (neither runs `next build`); it only breaks at `vercel deploy`.",
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("[vercelignore-guard] error:", err);
  process.exitCode = 1;
});
