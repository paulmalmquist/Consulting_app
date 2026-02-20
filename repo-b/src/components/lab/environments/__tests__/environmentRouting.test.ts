import { resolveEnvironmentOpenPath } from "@/components/lab/environments/constants";

describe("environment open routing", () => {
  test("routes real estate environments into REPE workspace", () => {
    expect(resolveEnvironmentOpenPath({ envId: "env-1", industry: "real_estate" })).toBe("/app/repe/portfolio");
    expect(resolveEnvironmentOpenPath({ envId: "env-1", industry: "real_estate_pe" })).toBe("/app/repe/portfolio");
  });

  test("keeps non-RE environments in lab workspace", () => {
    expect(resolveEnvironmentOpenPath({ envId: "env-9", industry: "healthcare" })).toBe("/lab/env/env-9");
  });
});
