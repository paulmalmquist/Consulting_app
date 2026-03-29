import { NextRequest, NextResponse } from "next/server";

import { environmentCatalog, environmentLoginPath, isEnvironmentSlug } from "@/lib/environmentAuth";
import { revokePlatformSession } from "@/lib/server/platformAuth";
import { clearPlatformSessionCookies } from "@/lib/server/platformSessionCookies";
import { PLATFORM_SESSION_COOKIE, verifyPlatformSession } from "@/lib/server/sessionAuth";

export const dynamicParams = false;
export const runtime = "nodejs";

export function generateStaticParams() {
  return Object.keys(environmentCatalog).map((environmentSlug) => ({ environmentSlug }));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ environmentSlug: string }> },
) {
  const { environmentSlug } = await params;
  if (!isEnvironmentSlug(environmentSlug)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const session = await verifyPlatformSession(
    request.cookies.get(PLATFORM_SESSION_COOKIE)?.value,
  );
  await revokePlatformSession(session?.session_id);

  const response = NextResponse.redirect(new URL(environmentLoginPath(environmentSlug), request.url));
  clearPlatformSessionCookies(response);
  return response;
}
