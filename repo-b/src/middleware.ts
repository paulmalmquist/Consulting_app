import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPrefixes = ["/lab", "/app", "/onboarding", "/documents", "/tasks"];
const privateApiPrefixes = ["/api/commands", "/api/mcp", "/api/ai/codex"];
const publicApiPrefixes = ["/api/public", "/api/auth/login"];
const publicPagePrefixes = ["/", "/login", "/public"];

function isProtectedPath(pathname: string): boolean {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isPrivateApiPath(pathname: string): boolean {
  return privateApiPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isPublicApiPath(pathname: string): boolean {
  return publicApiPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isPublicPage(pathname: string): boolean {
  return publicPagePrefixes.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicApiPath(pathname)) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get("demo_lab_session")?.value);

  if (pathname === "/onboarding" && !hasSession) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/public/onboarding";
    return NextResponse.rewrite(rewriteUrl);
  }

  if (isPrivateApiPath(pathname) && !hasSession) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (isPublicPage(pathname)) {
    return NextResponse.next();
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/commands/:path*",
    "/api/mcp/:path*",
    "/api/ai/codex/:path*",
    "/api/public/:path*",
    "/api/auth/login",
    "/lab",
    "/lab/:path*",
    "/app",
    "/app/:path*",
    "/onboarding",
    "/onboarding/:path*",
    "/documents",
    "/documents/:path*",
    "/tasks",
    "/tasks/:path*",
  ],
};
