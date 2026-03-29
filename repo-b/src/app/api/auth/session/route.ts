import { NextRequest, NextResponse } from "next/server";

import { isEnvironmentSlug } from "@/lib/environmentAuth";
import { issuePlatformSession } from "@/lib/server/platformAuth";
import { applyPlatformSessionCookies } from "@/lib/server/platformSessionCookies";

export const runtime = "nodejs";

function firstForwardedIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || null;
}

export async function POST(request: NextRequest) {
  let body: {
    accessToken?: string;
    environmentSlug?: string | null;
    returnTo?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.accessToken) {
    return NextResponse.json({ error: "accessToken is required" }, { status: 400 });
  }

  if (body.environmentSlug && !isEnvironmentSlug(body.environmentSlug)) {
    return NextResponse.json({ error: "Unknown environment" }, { status: 404 });
  }

  const environmentSlug =
    body.environmentSlug && isEnvironmentSlug(body.environmentSlug)
      ? body.environmentSlug
      : undefined;

  try {
    const session = await issuePlatformSession({
      accessToken: body.accessToken,
      environmentSlug,
      returnTo: body.returnTo || undefined,
      userAgent: request.headers.get("user-agent"),
      ipAddress: firstForwardedIp(request),
    });

    const response = NextResponse.json({
      ok: true,
      redirectTo: session.redirectTo,
      activeEnvironment: session.activeMembership,
      platformAdmin: session.claims.platform_admin,
    });
    applyPlatformSessionCookies(response, {
      token: session.token,
      claims: session.claims,
      activeMembership: session.activeMembership,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Session exchange failed";
    const redirectTo =
      error && typeof error === "object" && "redirectTo" in error && typeof error.redirectTo === "string"
        ? error.redirectTo
        : null;

    if (message.includes("invalid or expired")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (redirectTo) {
      return NextResponse.json({ error: message, redirectTo }, { status: 403 });
    }

    if (message.includes("suspended")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
