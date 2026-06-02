import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildTelemetryReviewerClaims,
  isTelemetryReviewerSession,
  telemetryReviewerAllowedPath,
  telemetryReviewerConfig,
  telemetryReviewerEnvId,
  verifyTelemetryReviewer,
} from "./telemetryReviewer";

const ENV = "dc82d39d-9be2-49b0-a01d-c7181b13a8b6";

describe("telemetryReviewer", () => {
  beforeEach(() => {
    process.env.TELEMETRY_REVIEWER_USERNAME = "telemetry";
    process.env.TELEMETRY_REVIEWER_PASSWORD = "relativity_11";
    process.env.TELEMETRY_REVIEWER_ENV_ID = ENV;
  });
  afterEach(() => {
    delete process.env.TELEMETRY_REVIEWER_USERNAME;
    delete process.env.TELEMETRY_REVIEWER_PASSWORD;
    delete process.env.TELEMETRY_REVIEWER_ENV_ID;
  });

  it("config returns the credential when all env vars are set", () => {
    expect(telemetryReviewerConfig()).toEqual({ username: "telemetry", password: "relativity_11", envId: ENV });
  });

  it("config is disabled (null) — fail closed — if any env var is missing", () => {
    delete process.env.TELEMETRY_REVIEWER_PASSWORD;
    expect(telemetryReviewerConfig()).toBeNull();
    expect(verifyTelemetryReviewer("telemetry", "relativity_11")).toBeNull();
  });

  it("verifies correct credentials and rejects wrong ones", () => {
    expect(verifyTelemetryReviewer("telemetry", "relativity_11")?.envId).toBe(ENV);
    expect(verifyTelemetryReviewer("telemetry", "wrong")).toBeNull();
    expect(verifyTelemetryReviewer("admin", "relativity_11")).toBeNull();
    expect(verifyTelemetryReviewer("", "")).toBeNull();
  });

  it("builds scoped, non-admin claims with a single telemetry membership", () => {
    const { claims, membership } = buildTelemetryReviewerClaims(ENV);
    expect(claims.platform_admin).toBe(false);
    expect(claims.active_role).toBe("telemetry_reviewer");
    expect(claims.active_env_id).toBe(ENV);
    expect(claims.supabase_user_id).toBeNull();
    expect(claims.email).not.toContain("@novendor.ai");
    expect(claims.memberships).toHaveLength(1);
    expect(membership).toMatchObject({ env_id: ENV, role: "telemetry_reviewer", status: "active" });
  });

  it("detects a reviewer session and resolves its env id", () => {
    const { claims } = buildTelemetryReviewerClaims(ENV);
    expect(isTelemetryReviewerSession(claims)).toBe(true);
    expect(telemetryReviewerEnvId(claims)).toBe(ENV);
    const admin = { active_role: "owner" as const, active_env_id: "x", memberships: [{ env_id: "x", env_slug: "novendor" as const, role: "owner" as const, status: "active" as const, is_default: true }] };
    expect(isTelemetryReviewerSession(admin)).toBe(false);
    expect(isTelemetryReviewerSession(null)).toBe(false);
  });

  it("allows ONLY the env's /telemetry routes", () => {
    const ok = (p: string) => telemetryReviewerAllowedPath(p, ENV);
    expect(ok(`/lab/env/${ENV}/telemetry`)).toBe(true);
    expect(ok(`/lab/env/${ENV}/telemetry/replay`)).toBe(true);
    expect(ok(`/lab/env/${ENV}/telemetry/governance`)).toBe(true);
    // blocked: other departments, other envs, admin/app, slug surfaces
    expect(ok(`/lab/env/${ENV}/consulting`)).toBe(false);
    expect(ok(`/lab/env/${ENV}`)).toBe(false);
    expect(ok(`/lab/env/OTHER-ENV/telemetry`)).toBe(false);
    expect(ok(`/lab/system/control-tower`)).toBe(false);
    expect(ok(`/app`)).toBe(false);
    expect(ok(`/novendor`)).toBe(false);
    // a lookalike prefix must not slip through
    expect(ok(`/lab/env/${ENV}/telemetry-secret`)).toBe(false);
    expect(telemetryReviewerAllowedPath(`/lab/env/${ENV}/telemetry`, null)).toBe(false);
  });
});
