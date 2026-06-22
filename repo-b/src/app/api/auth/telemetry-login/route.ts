// Scoped telemetry reviewer login. Verifies the dedicated env-var credential and mints a signed
// `bm_session` confined (by middleware) to the telemetry env's /telemetry routes. Never grants admin,
// other-env, or provisioning access. Fail-closed: disabled if the env vars aren't all set.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { applyPlatformSessionCookies } from "@/lib/server/platformSessionCookies";
import { signPlatformSession } from "@/lib/server/sessionAuth";
import {
  buildTelemetryReviewerClaims,
  telemetryReviewerConfig,
  telemetryReviewerHome,
  verifyTelemetryReviewer,
} from "@/lib/server/telemetryReviewer";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Fail closed: if the credential isn't configured, reviewer login is disabled.
  if (!telemetryReviewerConfig()) {
    console.error(
      "[auth] telemetry reviewer login is disabled: set TELEMETRY_REVIEWER_USERNAME, " +
        "TELEMETRY_REVIEWER_PASSWORD and TELEMETRY_REVIEWER_ENV_ID to enable it.",
    );
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const verified = verifyTelemetryReviewer(String(body.username ?? ""), String(body.password ?? ""));
  if (!verified) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const { claims, membership } = buildTelemetryReviewerClaims(verified.envId);
  const token = await signPlatformSession(claims); // requires BM_SESSION_SECRET (already configured)
  const response = NextResponse.json({ ok: true, redirectTo: telemetryReviewerHome(verified.envId) });
  applyPlatformSessionCookies(response, { token, claims, activeMembership: membership });
  return response;
}
