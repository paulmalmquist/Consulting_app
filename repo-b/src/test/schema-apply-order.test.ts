import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// eslint-disable-next-line
const { compareSchemaFiles } = require("../../db/schema/apply.js") as {
  compareSchemaFiles: (a: string, b: string) => number;
};

describe("compareSchemaFiles", () => {
  it("orders by numeric prefix, not lexicographically", () => {
    const input = [
      "10000_crm_next_action.sql",
      "260_crm_native.sql",
      "001_core.sql",
      "9999_seed.sql",
      "999_seed.sql",
    ];
    const sorted = [...input].sort(compareSchemaFiles);
    expect(sorted).toEqual([
      "001_core.sql",
      "260_crm_native.sql",
      "999_seed.sql",
      "9999_seed.sql",
      "10000_crm_next_action.sql",
    ]);
  });

  it("keeps non-numeric-prefixed files at the end and stable", () => {
    const input = ["bravo.sql", "10_x.sql", "alpha.sql", "2_a.sql"];
    const sorted = [...input].sort(compareSchemaFiles);
    expect(sorted).toEqual(["2_a.sql", "10_x.sql", "alpha.sql", "bravo.sql"]);
  });

  it("real schema dir: every dependency-creating migration runs before its dependants", () => {
    // Regression for the 2026-05 CI break: 10000_crm_next_action.sql ran before
    // 260_crm_native.sql because of lex sort, so ALTER TABLE crm_opportunity failed.
    const schemaDir = path.resolve(__dirname, "../../db/schema");
    const files = fs
      .readdirSync(schemaDir)
      .filter((f) => f.endsWith(".sql"))
      .sort(compareSchemaFiles);

    const idx = (name: string) => files.indexOf(name);
    expect(idx("260_crm_native.sql")).toBeGreaterThan(-1);
    expect(idx("10000_crm_next_action.sql")).toBeGreaterThan(-1);
    expect(idx("260_crm_native.sql")).toBeLessThan(idx("10000_crm_next_action.sql"));
  });
});
