import {
  environmentDisplayHomePath,
  environmentHomePath,
  environmentLoginPath,
  environmentUnauthorizedPath,
  isEnvironmentManagerRole,
  sanitizeReturnTo,
} from "@/lib/environmentAuth";

describe("environmentAuth", () => {
  it("maps each environment to its branded login and unauthorized routes", () => {
    expect(environmentLoginPath("novendor")).toBe("/novendor/login");
    expect(environmentLoginPath("meridian")).toBe("/meridian/login");
    expect(environmentLoginPath("stone-pds")).toBe("/stone-pds/login");
    expect(environmentUnauthorizedPath("trading")).toBe("/trading/unauthorized");
  });

  it("resolves environment-specific default homes", () => {
    expect(environmentHomePath({ slug: "novendor", envId: "env-1" })).toBe("/lab/env/env-1/consulting");
    expect(environmentHomePath({ slug: "floyorker", envId: "env-2" })).toBe("/lab/env/env-2/content");
    expect(environmentHomePath({ slug: "stone-pds", envId: "env-3" })).toBe("/lab/env/env-3/pds");
    expect(environmentHomePath({ slug: "meridian", envId: "env-4" })).toBe("/lab/env/env-4/re");
    expect(environmentHomePath({ slug: "trading", envId: "env-5" })).toBe("/lab/env/env-5/markets");
  });

  it("treats only owner and admin as environment managers", () => {
    expect(isEnvironmentManagerRole("owner")).toBe(true);
    expect(isEnvironmentManagerRole("admin")).toBe(true);
    expect(isEnvironmentManagerRole("member")).toBe(false);
    expect(isEnvironmentManagerRole("viewer")).toBe(false);
  });

  it("sanitizes unsafe return paths", () => {
    expect(sanitizeReturnTo("/trading?view=positions")).toBe("/trading?view=positions");
    expect(sanitizeReturnTo("https://example.com")).toBeNull();
    expect(sanitizeReturnTo("//evil.test")).toBeNull();
  });
});
