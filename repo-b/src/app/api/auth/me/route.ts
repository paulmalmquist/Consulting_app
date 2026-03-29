import { NextRequest, NextResponse } from "next/server";

import {
  getActiveMembership,
  isPlatformAdminSession,
  parseSessionFromRequest,
} from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await parseSessionFromRequest(request);

  if (!session) {
    return NextResponse.json(
      { authenticated: false, session: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      session: {
        platformUserId: session.platform_user_id || null,
        email: session.email || null,
        displayName: session.display_name || null,
        platformAdmin: isPlatformAdminSession(session),
        activeEnvironment: getActiveMembership(session),
        memberships: session.memberships || [],
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
