import { NextRequest, NextResponse } from "next/server";

import { isEnvironmentSlug } from "@/lib/environmentAuth";
import { rotatePlatformSessionEnvironment } from "@/lib/server/platformAuth";
import { applyPlatformSessionCookies } from "@/lib/server/platformSessionCookies";
import { PLATFORM_SESSION_COOKIE, verifyPlatformSession } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await verifyPlatformSession(
    request.cookies.get(PLATFORM_SESSION_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { environmentSlug?: string | null; envId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const targetSlug = body.environmentSlug || null;
  const targetEnvId = body.envId || null;

  if (!targetSlug && !targetEnvId) {
    return NextResponse.json({ error: "environmentSlug or envId is required" }, { status: 400 });
  }

  if (targetSlug && !isEnvironmentSlug(targetSlug)) {
    return NextResponse.json({ error: "Unknown environment" }, { status: 404 });
  }

  const normalizedTargetSlug =
    targetSlug && isEnvironmentSlug(targetSlug)
      ? targetSlug
      : undefined;

  try {
    const nextSession = await rotatePlatformSessionEnvironment({
      session,
      target: {
        envId: targetEnvId,
        slug: normalizedTargetSlug,
      },
    });

    const response = NextResponse.json({
      ok: true,
      redirectTo: nextSession.redirectTo,
      activeEnvironment: nextSession.membership,
    });
    applyPlatformSessionCookies(response, {
      token: nextSession.token,
      claims: nextSession.claims,
      activeMembership: nextSession.membership,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to switch environment";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
