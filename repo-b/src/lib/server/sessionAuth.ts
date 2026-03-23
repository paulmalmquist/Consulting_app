import { NextResponse } from "next/server";

const SESSION_COOKIE = "bos_session";
const LEGACY_COOKIE = "demo_lab_session";

type SessionPayload = { role?: string; env_id?: string };

/**
 * Parse the session from request cookies.
 * Prefers the structured bos_session cookie, falls back to the legacy cookie.
 */
export function parseSessionFromRequest(request: Request): SessionPayload | null {
  const cookieHeader = request.headers.get("cookie") || "";

  // Try structured bos_session first
  const bosPart = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  if (bosPart) {
    const raw = bosPart.slice(`${SESSION_COOKIE}=`.length).trim();
    if (raw) {
      try {
        return JSON.parse(decodeURIComponent(raw)) as SessionPayload;
      } catch {
        // malformed — fall through
      }
    }
  }

  // Fall back to legacy cookie
  const legacyPart = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${LEGACY_COOKIE}=`));
  if (legacyPart) {
    const value = legacyPart.slice(`${LEGACY_COOKIE}=`.length).trim();
    if (value === "active") {
      return { role: "env_user" };
    }
  }

  return null;
}

/** Returns true if the request has a valid session (any role). */
export function hasSession(request: Request): boolean {
  return parseSessionFromRequest(request) !== null;
}

/** Extract the actor identity from the session for audit logging. */
export function getSessionActor(request: Request): string {
  const session = parseSessionFromRequest(request);
  if (!session) return "anonymous";
  return session.role === "admin" ? "admin" : `user:${session.env_id || "default"}`;
}

/** @deprecated Use hasSession() instead */
export function hasDemoSession(request: Request): boolean {
  return hasSession(request);
}

export function unauthorizedJson(message = "Authentication required") {
  return NextResponse.json({ error: message }, { status: 401 });
}
