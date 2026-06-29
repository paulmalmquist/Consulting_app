import { describe, expect, it } from "vitest";

import { getActiveRichMembership } from "./platformMembershipRehydrate";
import { buildTelemetryReviewerClaims } from "./telemetryReviewer";

const TELEMETRY_ENV = "dc82d39d-9be2-49b0-a01d-c7181b13a8b6";

describe("getActiveRichMembership — telemetry reviewer guard", () => {
  it("synthesizes the rich membership for a reviewer session without a DB lookup", async () => {
    // A reviewer session's platform_user_id is the literal "telemetry-reviewer" (not a UUID).
    // If this hit loadRichMembershipByEnvId it would throw on the ::uuid cast (no DB pool here),
    // so resolving successfully proves the short-circuit avoids the DB entirely.
    const { claims } = buildTelemetryReviewerClaims(TELEMETRY_ENV);
    const rich = await getActiveRichMembership(claims);
    expect(rich).not.toBeNull();
    expect(rich?.env_id).toBe(TELEMETRY_ENV);
    expect(rich?.role).toBe("telemetry_reviewer");
    // Critical: no business_id → Agent Builder resolves the demo-scope param fallback,
    // never a real tenant, and write tools stay disabled.
    expect(rich?.business_id).toBeNull();
    expect(rich?.tenant_id).toBeNull();
  });
});
