import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type SessionPayload = { role?: string; env_id?: string };

function parseSession(request: NextRequest): SessionPayload | null {
  if (process.env.PLAYWRIGHT_BYPASS_AUTH === "1") return { role: "admin" };

  // Prefer the new structured session cookie
  const newCookie = request.cookies.get("bos_session")?.value;
  if (newCookie) {
    try {
      return JSON.parse(newCookie) as SessionPayload;
    } catch {
      return null;
    }
  }

  // Fall back to legacy invite-code cookie (treat as env_user)
  const legacyCookie = request.cookies.get("demo_lab_session")?.value;
  if (legacyCookie === "active") {
    return { role: "env_user" };
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = parseSession(request);
  const role = session?.role;

  // ── Always public ──────────────────────────────────────────────
  if (
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/public/")
  ) {
    return NextResponse.next();
  }

  // ── Admin-only routes (/admin) ─────────────────────────────────
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("loginType", "admin");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Protected env-user routes ─────────────────────────────────
  const protectedPrefixes = ["/lab", "/app", "/onboarding", "/documents", "/tasks"];
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected) {
    if (!role) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Private API routes ─────────────────────────────────────────
  const privateApiPrefixes = ["/api/commands", "/api/mcp", "/api/ai/codex"];
  const isPrivateApi = privateApiPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (isPrivateApi && !role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
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
