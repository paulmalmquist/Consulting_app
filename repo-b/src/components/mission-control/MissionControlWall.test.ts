import { describe, test, expect } from "vitest";

import { isDemoTelemetryEnv } from "./MissionControlWall";
import { deriveEnvironmentStatus } from "@/lib/intelligence/envStatus";
import type { Environment } from "@/components/EnvProvider";

// Mission Control composes existing state and FAILS CLOSED. Two load-bearing decisions are
// pure and testable: the live-telemetry gate (only the demo env gets a real feed) and the
// status wall's categorical derivation (no fabricated "Needs attention" off un-fetched data).

function env(partial: Partial<Environment>): Environment {
  return {
    env_id: "e1",
    client_name: "Env One",
    industry: "general",
    is_active: true,
    business_id: "biz-1",
    ...partial,
  } as Environment;
}

describe("isDemoTelemetryEnv (live-telemetry gate)", () => {
  test("true only for the telemetry demo env (by slug)", () => {
    expect(isDemoTelemetryEnv(env({ industry: "telemetry", slug: "telemetry-demo" }))).toBe(true);
  });

  test("false for a telemetry env that is not the demo env", () => {
    expect(isDemoTelemetryEnv(env({ industry: "telemetry", slug: "some-other-env" }))).toBe(false);
  });

  test("false for a non-telemetry env, and for null", () => {
    expect(isDemoTelemetryEnv(env({ industry: "consulting" }))).toBe(false);
    expect(isDemoTelemetryEnv(null)).toBe(false);
  });
});

describe("deriveEnvironmentStatus (status wall, extracted from home)", () => {
  test("route env with open anomalies => Needs attention", () => {
    const s = deriveEnvironmentStatus(env({}), 2, "biz-1");
    expect(s.label).toBe("Needs attention");
    expect(s.tone).toBe("amber");
  });

  test("active env with zero anomalies => Healthy (non-route envs pass 0, never fabricated)", () => {
    const s = deriveEnvironmentStatus(env({}), 0, "biz-1");
    expect(s.label).toBe("Healthy");
  });

  test("inactive env => Inactive", () => {
    expect(deriveEnvironmentStatus(env({ is_active: false }), 0, "biz-1").label).toBe("Inactive");
  });

  test("no tenant => Status unavailable (never scoped to the default tenant)", () => {
    expect(deriveEnvironmentStatus(env({}), 0, null).label).toBe("Status unavailable");
  });

  test("null env => Status unavailable", () => {
    expect(deriveEnvironmentStatus(null, 0, "biz-1").label).toBe("Status unavailable");
  });
});
