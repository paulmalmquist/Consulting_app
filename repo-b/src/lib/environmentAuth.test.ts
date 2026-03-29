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
    expect(environmentUnauthorizedPath("trading")).toBe("/trading/unauthorized");
  });

  it("resolves environment-specific default homes", () => {
    expect(environmentHomePath({ slug: "novendor", envId: "env-1" })).toBe("/lab/env/env-1/consulting");
    expect(environmentHomePath({ slug: "floyorker", envId: "env-2" })).toBe("/lab/env/env-2/content");
    expect(environmentHomePath({ slug: "resume", envId: "env-3" })).toBe("/lab/env/env-3/resume");
    expect(environmentHomePath({ slug: "trading", envId: "env-4" })).toBe("/lab/env/env-4/markets");
    expect(environmentDisplayHomePath("resume")).toBe("/resume");
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
