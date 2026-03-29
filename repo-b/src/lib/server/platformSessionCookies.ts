import type { NextResponse } from "next/server";

import type { PlatformMembershipSummary, PlatformSessionClaims } from "@/lib/server/sessionAuth";
import {
  ACTIVE_ENV_COOKIE,
  ACTIVE_ENV_SLUG_COOKIE,
  LEGACY_DEMO_COOKIE,
  LEGACY_SESSION_COOKIE,
  PLATFORM_SESSION_COOKIE,
} from "@/lib/server/sessionAuth";

function isSecureCookie() {
  return process.env.NODE_ENV === "production";
}

export function applyPlatformSessionCookies(
  response: NextResponse,
  args: {
    token: string;
    claims: PlatformSessionClaims;
    activeMembership: PlatformMembershipSummary;
  },
) {
  response.cookies.set({
    name: PLATFORM_SESSION_COOKIE,
    value: args.token,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    expires: new Date(args.claims.expires_at * 1000),
  });

  response.cookies.set({
    name: ACTIVE_ENV_COOKIE,
    value: args.activeMembership.env_id,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    expires: new Date(args.claims.expires_at * 1000),
  });

  response.cookies.set({
    name: ACTIVE_ENV_SLUG_COOKIE,
    value: args.activeMembership.env_slug,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    expires: new Date(args.claims.expires_at * 1000),
  });

  response.cookies.set({ name: LEGACY_SESSION_COOKIE, value: "", maxAge: 0, path: "/" });
  response.cookies.set({ name: LEGACY_DEMO_COOKIE, value: "", maxAge: 0, path: "/" });
}

export function clearPlatformSessionCookies(response: NextResponse) {
  response.cookies.set({ name: PLATFORM_SESSION_COOKIE, value: "", maxAge: 0, path: "/" });
  response.cookies.set({ name: ACTIVE_ENV_COOKIE, value: "", maxAge: 0, path: "/" });
  response.cookies.set({ name: ACTIVE_ENV_SLUG_COOKIE, value: "", maxAge: 0, path: "/" });
  response.cookies.set({ name: LEGACY_SESSION_COOKIE, value: "", maxAge: 0, path: "/" });
  response.cookies.set({ name: LEGACY_DEMO_COOKIE, value: "", maxAge: 0, path: "/" });
}
