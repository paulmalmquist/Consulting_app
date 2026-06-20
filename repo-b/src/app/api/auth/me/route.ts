import { NextRequest, NextResponse } from "next/server";

import {
  getActiveMembership,
  isPlatformAdminSession,
  parseSessionFromRequest,
} from "@/lib/server/sessionAuth";
import {
  loadRichMembershipByEnvId,
  loadRichMembershipsForUser,
} from "@/lib/server/platformMembershipRehydrate";
import { isTelemetryReviewerSession } from "@/lib/server/telemetryReviewer";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (process.env.PLAYWRIGHT_BYPASS_AUTH === "1") {
    return NextResponse.json(
      {
        authenticated: true,
        session: {
          platformUserId: "playwright-bypass-user",
          email: "playwright@test.local",
          displayName: "Playwright Test",
          platformAdmin: true,
          activeEnvironment: null,
          memberships: [],
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const session = await parseSessionFromRequest(request);

  if (!session) {
    return NextResponse.json(
      { authenticated: false, session: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (isTelemetryReviewerSession(session)) {
    const memberships = (session.memberships || []).map((membership) => ({
      ...membership,
      client_name: "RS Telemetry",
      auth_mode: "private" as const,
      business_id: null,
      tenant_id: null,
      industry: "aerospace",
      industry_type: null,
      workspace_template_key: null,
    }));
    const activeSlim = getActiveMembership(session);
    const activeEnvironment = activeSlim
      ? memberships.find((membership) => membership.env_id === activeSlim.env_id) || null
      : null;

    return NextResponse.json(
      {
        authenticated: true,
        session: {
          platformUserId: session.platform_user_id || null,
          email: session.email || null,
          displayName: session.display_name || null,
          platformAdmin: false,
          activeEnvironment,
          memberships,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Rehydrate rich membership rows from the DB. The JWT only carries slim
  // rows (env_id, env_slug, role, status, is_default) to keep the session
  // cookie under the browser's 4096-byte limit when a platform admin has
  // memberships across many environments.
  let memberships = [] as Awaited<ReturnType<typeof loadRichMembershipsForUser>>;
  let activeEnvironment: Awaited<ReturnType<typeof loadRichMembershipByEnvId>> = null;

  if (session.platform_user_id) {
    memberships = await loadRichMembershipsForUser(session.platform_user_id);
    const activeSlim = getActiveMembership(session);
    if (activeSlim) {
      activeEnvironment =
        memberships.find((row) => row.env_id === activeSlim.env_id) || null;
    }
  }

  return NextResponse.json(
    {
      authenticated: true,
      session: {
        platformUserId: session.platform_user_id || null,
        email: session.email || null,
        displayName: session.display_name || null,
        platformAdmin: isPlatformAdminSession(session),
        activeEnvironment,
        memberships,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
