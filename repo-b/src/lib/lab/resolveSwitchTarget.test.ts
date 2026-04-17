import {
  extractTopModule,
  primaryModuleForSlug,
  resolveSwitchTarget,
} from "./resolveSwitchTarget";

describe("extractTopModule", () => {
  test("returns top module after /lab/env/{id}/", () => {
    expect(extractTopModule("/lab/env/env-1/re")).toBe("re");
    expect(extractTopModule("/lab/env/env-1/consulting/loops")).toBe("consulting");
    expect(extractTopModule("/lab/env/env-1/operator/delivery/airport")).toBe("operator");
  });

  test("returns null when path is not a lab env path", () => {
    expect(extractTopModule("/app")).toBeNull();
    expect(extractTopModule("/")).toBeNull();
    expect(extractTopModule("/lab/env/env-1")).toBeNull();
  });
});

describe("primaryModuleForSlug", () => {
  test("maps known slugs to their primary module", () => {
    expect(primaryModuleForSlug("meridian", "env-a")).toBe("re");
    expect(primaryModuleForSlug("novendor", "env-a")).toBe("consulting");
    expect(primaryModuleForSlug("trading", "env-a")).toBe("markets");
    expect(primaryModuleForSlug("stone-pds", "env-a")).toBe("pds");
    expect(primaryModuleForSlug("floyorker", "env-a")).toBe("content");
    expect(primaryModuleForSlug("ncf", "env-a")).toBe("ncf");
  });
});

describe("resolveSwitchTarget", () => {
  const meridian = { env_id: "env-meridian", slug: "meridian" };
  const novendor = { env_id: "env-novendor", slug: "novendor" };
  const trading = { env_id: "env-trading", slug: "trading" };
  const unbranded = { env_id: "env-x", slug: null };

  test("preserves module when it matches the target's primary module, strips deep sub-path", () => {
    const result = resolveSwitchTarget(
      "/lab/env/env-meridian/re/funds/fund-123",
      meridian,
    );
    expect(result.path).toBe("/lab/env/env-meridian/re");
    expect(result.preservesModule).toBe(true);
    expect(result.reason).toBe("same-module");
  });

  test("falls through to target home when module does not exist in target env", () => {
    // Switching from Meridian's /re/funds/X to Novendor (whose primary is consulting)
    const result = resolveSwitchTarget(
      "/lab/env/env-meridian/re/funds/fund-123",
      novendor,
    );
    expect(result.path).toBe("/lab/env/env-novendor/consulting");
    expect(result.preservesModule).toBe(false);
    expect(result.reason).toBe("landing-fallback");
  });

  test("preserves shared module (documents) across environments", () => {
    const result = resolveSwitchTarget(
      "/lab/env/env-meridian/documents/some-doc",
      novendor,
    );
    expect(result.path).toBe("/lab/env/env-novendor/documents");
    expect(result.preservesModule).toBe(true);
    expect(result.reason).toBe("shared-module");
  });

  test("deep entity sub-paths are always stripped, even when preserving", () => {
    const result = resolveSwitchTarget(
      "/lab/env/env-novendor/consulting/loops/loop-abc/details",
      novendor,
    );
    expect(result.path).toBe("/lab/env/env-novendor/consulting");
    expect(result.path).not.toContain("loop-abc");
  });

  test("unknown slug falls back to env root when no module to preserve", () => {
    const result = resolveSwitchTarget("/lab/env/env-y", unbranded);
    expect(result.path).toBe("/lab/env/env-x");
    expect(result.preservesModule).toBe(false);
    expect(result.reason).toBe("landing-fallback");
  });

  test("non-lab-env paths fall through to the target home", () => {
    const result = resolveSwitchTarget("/app", trading);
    expect(result.path).toBe("/lab/env/env-trading/markets");
    expect(result.preservesModule).toBe(false);
    expect(result.reason).toBe("landing-fallback");
  });

  test("same-module preservation works across multiple markets envs", () => {
    const result = resolveSwitchTarget(
      "/lab/env/env-old/markets/execution",
      trading,
    );
    expect(result.path).toBe("/lab/env/env-trading/markets");
    expect(result.preservesModule).toBe(true);
    expect(result.reason).toBe("same-module");
  });
});
