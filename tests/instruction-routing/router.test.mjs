import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadRoutingRegistry,
  resolveInstructionRoute,
  validateInstructionDocs,
} from "../../scripts/instruction-routing.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..", "..");
const fixtures = JSON.parse(
  fs.readFileSync(path.join(TEST_DIR, "fixtures.json"), "utf8"),
);

test("instruction registry and generated artifacts validate cleanly", () => {
  const { errors } = validateInstructionDocs(ROOT);
  assert.deepEqual(errors, []);
});

test("every active registry source exists", () => {
  const registry = loadRoutingRegistry(ROOT);
  for (const route of registry.routes.filter((item) => item.status === "active")) {
    assert.equal(
      fs.existsSync(path.join(ROOT, route.source)),
      true,
      `${route.id} source missing: ${route.source}`,
    );
  }
});

test("active instructions contain no retired local paths, surfaces, or production domain", () => {
  const registry = loadRoutingRegistry(ROOT);
  const activeFiles = new Set([
    "CLAUDE.md",
    "AGENTS.md",
    "BOOTSTRAP.md",
    "HEARTBEAT.md",
    "docs/WINSTON_CODING_SESSION_INSTRUCTIONS.md",
    ...registry.routes
      .filter((item) => item.status === "active")
      .map((item) => item.source),
  ]);
  const banned = [
    "/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app",
    "paulmalmquist.com",
    "repo-c/",
  ];
  for (const relativePath of activeFiles) {
    const text = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    for (const value of banned) {
      assert.equal(
        text.includes(value),
        false,
        `${relativePath} contains retired value ${value}`,
      );
    }
  }
});

test("CLAUDE.md remains compact and the session hook is valid JSON", () => {
  const claudeLines = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8").split(/\r?\n/);
  assert.ok(claudeLines.length <= 200, `CLAUDE.md has ${claudeLines.length} lines`);

  const settings = JSON.parse(
    fs.readFileSync(path.join(ROOT, ".claude", "settings.json"), "utf8"),
  );
  const hooks = settings?.hooks?.SessionStart;
  assert.ok(Array.isArray(hooks) && hooks.length > 0, "SessionStart hook is missing");
  assert.equal(hooks[0].matcher, "startup|resume|clear|compact");
  assert.match(hooks[0].hooks[0].command, /session_context\.ps1/);
});

for (const fixture of fixtures) {
  test(`route fixture: ${fixture.name}`, () => {
    const result = resolveInstructionRoute(fixture.message, {
      mentionedPath: fixture.mentionedPath || "",
      rootDir: ROOT,
    });
    assert.equal(result.primaryId, fixture.expectedPrimaryId);
    assert.equal(result.needsClarification, fixture.needsClarification);
    if (fixture.expectedAdoRisk) assert.equal(result.adoRisk, fixture.expectedAdoRisk);
    if (fixture.expectedDelivery) {
      assert.equal(result.deliveryProfile, fixture.expectedDelivery);
    }
  });
}
