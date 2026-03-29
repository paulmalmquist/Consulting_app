import { NextRequest, NextResponse } from "next/server";

import { revokePlatformSession } from "@/lib/server/platformAuth";
import { clearPlatformSessionCookies } from "@/lib/server/platformSessionCookies";
import {
  getLoginRedirectForSession,
  parseSessionFromRequest,
  PLATFORM_SESSION_COOKIE,
  verifyPlatformSession,
} from "@/lib/server/sessionAuth";

export async function POST(request: NextRequest) {
  const [compatSession, verifiedSession] = await Promise.all([
    parseSessionFromRequest(request),
    verifyPlatformSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value),
  ]);
  const redirectTo = getLoginRedirectForSession(compatSession);
  const response = NextResponse.json({ ok: true, redirectTo });
  clearPlatformSessionCookies(response);
  await revokePlatformSession(verifiedSession?.session_id);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
