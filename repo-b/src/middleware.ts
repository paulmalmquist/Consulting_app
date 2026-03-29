import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  environmentLoginPath,
  environmentUnauthorizedPath,
  type EnvironmentSlug,
  isEnvironmentSlug,
} from "@/lib/environmentAuth";
import { applyPlatformSessionCookies } from "@/lib/server/platformSessionCookies";
import {
  isPlatformAdminSession,
  parseSessionFromNextRequest,
  PLATFORM_SESSION_COOKIE,
  signPlatformSession,
  verifyPlatformSession,
} from "@/lib/server/sessionAuth";

const TOP_LEVEL_ENV_RE = /^\/(novendor|floyorker|stone-pds|meridian|resume|trading)(?:\/|$)/;
const LAB_ENV_RE = /^\/lab\/env\/([^/]+)(?:\/|$)/;

function buildLoginRedirect(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("returnTo", pathname);
  return url;
}

function buildEnvironmentLoginRedirect(request: NextRequest, slug: EnvironmentSlug, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = environmentLoginPath(slug);
  url.searchParams.set("returnTo", pathname);
  return url;
}

function isPublicEnvironmentPath(pathname: string, slug: EnvironmentSlug) {
  if (pathname === `/${slug}/login`) return true;
  if (pathname === `/${slug}/unauthorized`) return true;
  if (pathname === `/${slug}/logout`) return true;
  if (pathname === `/${slug}/auth/callback`) return true;
  if (slug === "resume" && pathname === "/resume") return true;
  return false;
}

function membershipForSlug(
  memberships: Array<{ env_id: string; env_slug: string; role: string; status: string }>,
  slug: EnvironmentSlug,
) {
  return memberships.find((membership) => membership.env_slug === slug && membership.status === "active") || null;
}

function membershipForEnvId(
  memberships: Array<{ env_id: string; env_slug: string; role: string; status: string }>,
  envId: string,
) {
  return memberships.find((membership) => membership.env_id === envId && membership.status === "active") || null;
}

async function maybeRotateSessionByMembership(
  request: NextRequest,
  response: NextResponse,
  target: { envId?: string | null; slug?: EnvironmentSlug | null },
) {
  const raw = request.cookies.get(PLATFORM_SESSION_COOKIE)?.value;
  const claims = await verifyPlatformSession(raw);
  if (!claims) return response;

  const membership = target.envId
    ? membershipForEnvId(claims.memberships, target.envId)
    : target.slug
      ? membershipForSlug(claims.memberships, target.slug)
      : null;

  if (!membership) return response;
  if (claims.active_env_id === membership.env_id && claims.active_env_slug === membership.env_slug) {
    return response;
  }

  const rotatedClaims = {
    ...claims,
    active_env_id: membership.env_id,
    active_env_slug: membership.env_slug as EnvironmentSlug,
    active_role: membership.role as "owner" | "admin" | "member" | "viewer",
  };
  const token = await signPlatformSession(rotatedClaims);
  applyPlatformSessionCookies(response, {
    token,
    claims: rotatedClaims,
    activeMembership: membership as typeof claims.memberships[number],
  });
  return response;
}

async function readSession(request: NextRequest) {
  if (process.env.PLAYWRIGHT_BYPASS_AUTH === "1") {
    return {
      role: "admin",
      platform_admin: true,
      memberships: [],
    };
  }
  return parseSessionFromNextRequest(request);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await readSession(request);

  if (
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/public/") ||
    pathname === "/login"
  ) {
    return NextResponse.next();
  }

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = session ? "/lab/environments" : "/login";
    return NextResponse.redirect(url);
  }

  const topLevelEnvironment = pathname.match(TOP_LEVEL_ENV_RE)?.[1] || null;
  if (topLevelEnvironment && isEnvironmentSlug(topLevelEnvironment)) {
    if (isPublicEnvironmentPath(pathname, topLevelEnvironment)) {
      return NextResponse.next();
    }

    if (!session) {
      return NextResponse.redirect(
        buildEnvironmentLoginRedirect(request, topLevelEnvironment, pathname),
      );
    }

    const membership = membershipForSlug(session.memberships || [], topLevelEnvironment);
    if (!membership && !isPlatformAdminSession(session)) {
      const url = request.nextUrl.clone();
      url.pathname = environmentUnauthorizedPath(topLevelEnvironment);
      return NextResponse.redirect(url);
    }

    if (
      pathname === "/resume/admin" &&
      membership &&
      !["owner", "admin"].includes(membership.role) &&
      !isPlatformAdminSession(session)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = environmentUnauthorizedPath("resume");
      return NextResponse.redirect(url);
    }

    const response = NextResponse.next();
    if (!membership) return response;
    return maybeRotateSessionByMembership(request, response, { slug: topLevelEnvironment });
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const url = request.nextUrl.clone();
    if (pathname === "/admin/access" || pathname.startsWith("/admin/access/")) {
      url.pathname = "/lab/system/access";
    } else {
      url.pathname = "/lab/system/control-tower";
    }
    return NextResponse.redirect(url, { status: 308 });
  }

  const protectedPrefixes = ["/lab", "/app", "/onboarding", "/documents", "/tasks"];
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isProtected) {
    if (!session) {
      return NextResponse.redirect(buildLoginRedirect(request, pathname));
    }

    const envId = pathname.match(LAB_ENV_RE)?.[1] || null;
    if (envId) {
      const membership = membershipForEnvId(session.memberships || [], envId);
      if (!membership && !isPlatformAdminSession(session)) {
        return new NextResponse("Not Found", { status: 404 });
      }
      if (membership) {
        const response = NextResponse.next();
        return maybeRotateSessionByMembership(request, response, { envId });
      }
    }

    return NextResponse.next();
  }

  const privateApiPrefixes = ["/api/commands", "/api/mcp", "/api/ai/gateway", "/api/admin/access"];
  const isPrivateApi = privateApiPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isPrivateApi && !session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/admin",
    "/admin/:path*",
    "/api/auth/:path*",
    "/api/public/:path*",
    "/api/commands/:path*",
    "/api/mcp/:path*",
    "/api/ai/gateway/:path*",
    "/api/admin/access/:path*",
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
    "/novendor/:path*",
    "/floyorker/:path*",
    "/resume",
    "/resume/:path*",
    "/trading/:path*",
  ],
};
