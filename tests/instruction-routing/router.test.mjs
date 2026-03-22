import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { resolveInstructionRoute, validateInstructionDocs } from "../../scripts/instruction-routing.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const fixtures = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tests/instruction-routing/fixtures.json"), "utf8"),
);

test("instruction metadata validates cleanly", () => {
  const { errors } = validateInstructionDocs(ROOT);
  assert.deepEqual(errors, []);
});

for (const fixture of fixtures) {
  test(`route fixture: ${fixture.name}`, () => {
    const result = resolveInstructionRoute(fixture.message, { rootDir: ROOT });
    assert.equal(result.primaryId, fixture.expectedPrimaryId);
    assert.equal(result.needsClarification, fixture.needsClarification);
  });
}
