import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import type {
  EnvironmentAuthMode,
  EnvironmentMembershipRole,
  EnvironmentMembershipStatus,
  EnvironmentSlug,
} from "@/lib/environmentAuth";
import {
  environmentLoginPath,
  isEnvironmentManagerRole,
  isEnvironmentSlug,
} from "@/lib/environmentAuth";

export const PLATFORM_SESSION_COOKIE = "bm_session";
export const LEGACY_SESSION_COOKIE = "bos_session";
export const LEGACY_DEMO_COOKIE = "demo_lab_session";
export const ACTIVE_ENV_COOKIE = "demo_lab_env_id";
export const ACTIVE_ENV_SLUG_COOKIE = "bm_env_slug";

const SESSION_VERSION = 1;
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const textEncoder = new TextEncoder();

export type PlatformMembershipSummary = {
  env_id: string;
  env_slug: EnvironmentSlug;
  client_name: string;
  role: EnvironmentMembershipRole;
  status: EnvironmentMembershipStatus;
  auth_mode: EnvironmentAuthMode;
  is_default: boolean;
  business_id: string | null;
  tenant_id: string | null;
  industry: string | null;
  industry_type: string | null;
  workspace_template_key: string | null;
};

// Slim membership row stored in the JWT cookie. Keep fields minimal so the
// cookie stays under the browser's 4096-byte per-cookie limit even when a
// platform admin has memberships across dozens of environments. Rich fields
// (client_name, business_id, tenant_id, industry, etc.) are refetched from
// the DB by /api/auth/me and by server-side helpers that need them.
export type PlatformMembershipSlim = {
  env_id: string;
  env_slug: EnvironmentSlug;
  role: EnvironmentMembershipRole;
  status: EnvironmentMembershipStatus;
  is_default: boolean;
};

export function toSlimMembership(row: PlatformMembershipSummary): PlatformMembershipSlim {
  return {
    env_id: row.env_id,
    env_slug: row.env_slug,
    role: row.role,
    status: row.status,
    is_default: row.is_default,
  };
}

export type PlatformSessionClaims = {
  v: number;
  session_id: string;
  platform_user_id: string;
  supabase_user_id: string | null;
  email: string;
  display_name: string | null;
  issued_at: number;
  expires_at: number;
  platform_admin: boolean;
  active_env_id: string | null;
  active_env_slug: EnvironmentSlug | null;
  active_role: EnvironmentMembershipRole | null;
  memberships: PlatformMembershipSlim[];
};

export type SessionPayload = {
  role?: string;
  env_id?: string;
  session_id?: string;
  platform_user_id?: string | null;
  supabase_user_id?: string | null;
  email?: string | null;
  display_name?: string | null;
  platform_admin?: boolean;
  active_env_id?: string | null;
  active_env_slug?: EnvironmentSlug | null;
  active_role?: EnvironmentMembershipRole | null;
  memberships?: PlatformMembershipSlim[];
  issued_at?: number;
  expires_at?: number;
  active_membership?: PlatformMembershipSlim | null;
  legacy?: boolean;
};

function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function getSessionTtlSeconds() {
  const configured = Number(process.env.BM_SESSION_TTL_SECONDS || "");
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return DEFAULT_SESSION_TTL_SECONDS;
}

export function buildSessionExpiryTimestampSeconds() {
  return nowInSeconds() + getSessionTtlSeconds();
}

function sessionSecret() {
  return (
    process.env.BM_SESSION_SECRET ||
    process.env.AUTH_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ""
  ).trim();
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseCookieHeader(cookieHeader: string) {
  const cookieMap = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    cookieMap.set(key, value);
  }
  return cookieMap;
}

function selectActiveMembership(
  memberships: PlatformMembershipSlim[],
  activeEnvId: string | null | undefined,
  activeSlug: EnvironmentSlug | null | undefined,
) {
  const active = memberships.find((membership) => {
    if (activeEnvId && membership.env_id === activeEnvId) return true;
    if (activeSlug && membership.env_slug === activeSlug) return true;
    return false;
  });
  if (active) return active;
  return memberships.find((membership) => membership.is_default && membership.status === "active")
    || memberships.find((membership) => membership.status === "active")
    || memberships[0]
    || null;
}

function legacyFromBosCookie(raw: string): SessionPayload | null {
  const decoded = decodeURIComponent(raw);
  const parsed = parseJson<{ role?: string; env_id?: string }>(decoded);
  if (!parsed) return null;
  return {
    legacy: true,
    role: parsed.role,
    env_id: parsed.env_id,
    active_env_id: parsed.env_id,
    active_role: parsed.role === "admin" ? "owner" : "member",
    platform_admin: parsed.role === "admin",
    memberships: parsed.env_id
      ? [
          {
            env_id: parsed.env_id,
            env_slug: "novendor",
            role: parsed.role === "admin" ? "owner" : "member",
            status: "active",
            is_default: true,
          },
        ]
      : [],
  };
}

function legacyFromDemoCookie(raw: string): SessionPayload | null {
  if (raw !== "active") return null;
  return {
    legacy: true,
    role: "env_user",
    active_role: "member",
    platform_admin: false,
    memberships: [],
  };
}

function toCompatSession(claims: PlatformSessionClaims): SessionPayload {
  const activeMembership = selectActiveMembership(
    claims.memberships || [],
    claims.active_env_id,
    claims.active_env_slug,
  );
  return {
    ...claims,
    role: claims.platform_admin ? "admin" : activeMembership ? "env_user" : undefined,
    env_id: activeMembership?.env_id || claims.active_env_id || undefined,
    active_env_id: activeMembership?.env_id || claims.active_env_id,
    active_env_slug: activeMembership?.env_slug || claims.active_env_slug,
    active_role: activeMembership?.role || claims.active_role,
    active_membership: activeMembership,
  };
}

export function decodePlatformSessionPayloadUnsafe(token: string | null | undefined): PlatformSessionClaims | null {
  if (!token) return null;
  const [payload] = token.split(".");
  if (!payload) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(payload));
    return parseJson<PlatformSessionClaims>(json);
  } catch {
    return null;
  }
}

async function signHmac(input: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(input));
  return toBase64Url(new Uint8Array(signature));
}

export async function signPlatformSession(claims: PlatformSessionClaims) {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error("BM_SESSION_SECRET (or AUTH_SESSION_SECRET) must be configured");
  }
  const normalized: PlatformSessionClaims = {
    ...claims,
    v: SESSION_VERSION,
  };
  const payload = toBase64Url(textEncoder.encode(JSON.stringify(normalized)));
  const signature = await signHmac(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifyPlatformSession(token: string | null | undefined): Promise<PlatformSessionClaims | null> {
  if (!token) return null;
  const secret = sessionSecret();
  if (!secret) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = await signHmac(payload, secret);
  if (signature !== expected) return null;

  try {
    const json = new TextDecoder().decode(fromBase64Url(payload));
    const parsed = parseJson<PlatformSessionClaims>(json);
    if (!parsed || parsed.v !== SESSION_VERSION) return null;
    if (parsed.expires_at && parsed.expires_at <= nowInSeconds()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function parsePlatformSessionFromCookieValue(token: string | null | undefined) {
  const verified = await verifyPlatformSession(token);
  return verified ? toCompatSession(verified) : null;
}

export async function parseSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieMap = parseCookieHeader(cookieHeader);

  const platformSession = await parsePlatformSessionFromCookieValue(cookieMap.get(PLATFORM_SESSION_COOKIE));
  if (platformSession) return platformSession;

  const legacyBos = cookieMap.get(LEGACY_SESSION_COOKIE);
  if (legacyBos) {
    const parsed = legacyFromBosCookie(legacyBos);
    if (parsed) return parsed;
  }

  const legacyDemo = cookieMap.get(LEGACY_DEMO_COOKIE);
  if (legacyDemo) {
    const parsed = legacyFromDemoCookie(legacyDemo);
    if (parsed) return parsed;
  }

  return null;
}

export async function parseSessionFromNextRequest(request: NextRequest) {
  const platform = await parsePlatformSessionFromCookieValue(
    request.cookies.get(PLATFORM_SESSION_COOKIE)?.value,
  );
  if (platform) return platform;

  const legacyBos = request.cookies.get(LEGACY_SESSION_COOKIE)?.value;
  if (legacyBos) {
    const parsed = legacyFromBosCookie(legacyBos);
    if (parsed) return parsed;
  }

  const legacyDemo = request.cookies.get(LEGACY_DEMO_COOKIE)?.value;
  if (legacyDemo) {
    const parsed = legacyFromDemoCookie(legacyDemo);
    if (parsed) return parsed;
  }

  return null;
}

export async function hasSession(request: Request): Promise<boolean> {
  return (await parseSessionFromRequest(request)) !== null;
}

export function findMembershipByEnvId(
  session: SessionPayload | null | undefined,
  envId: string | null | undefined,
) {
  if (!session || !envId) return null;
  return session.memberships?.find((membership) => membership.env_id === envId) || null;
}

export function findMembershipBySlug(
  session: SessionPayload | null | undefined,
  slug: string | null | undefined,
) {
  if (!session || !slug || !isEnvironmentSlug(slug)) return null;
  return session.memberships?.find((membership) => membership.env_slug === slug) || null;
}

export function getActiveMembership(session: SessionPayload | null | undefined) {
  if (!session) return null;
  return session.active_membership
    || selectActiveMembership(
      session.memberships || [],
      session.active_env_id || session.env_id || null,
      session.active_env_slug || null,
    );
}

export function isPlatformAdminSession(session: SessionPayload | null | undefined) {
  if (!session) return false;
  if (session.platform_admin) return true;
  if (session.role === "admin") return true;
  return Boolean(
    session.memberships?.some((membership) => membership.status === "active" && isEnvironmentManagerRole(membership.role)),
  );
}

export function sessionHasEnvironmentAccess(
  session: SessionPayload | null | undefined,
  target: { envId?: string | null; slug?: string | null },
) {
  if (!session) return false;
  const membership = target.envId
    ? findMembershipByEnvId(session, target.envId)
    : findMembershipBySlug(session, target.slug);
  return Boolean(membership && membership.status === "active");
}

export function sessionHasManagerAccess(
  session: SessionPayload | null | undefined,
  target?: { envId?: string | null; slug?: string | null },
) {
  if (!session) return false;
  if (!target) return isPlatformAdminSession(session);
  const membership = target.envId
    ? findMembershipByEnvId(session, target.envId)
    : findMembershipBySlug(session, target.slug);
  return Boolean(membership && membership.status === "active" && isEnvironmentManagerRole(membership.role));
}

export async function getSessionActor(request: Request): Promise<string> {
  const session = await parseSessionFromRequest(request);
  if (!session) return "anonymous";
  if (isPlatformAdminSession(session) && !session.platform_user_id) return "admin";
  const activeMembership = getActiveMembership(session);
  const scope = activeMembership?.env_slug || session.active_env_slug || "platform";
  return session.platform_user_id ? `user:${scope}:${session.platform_user_id}` : (session.role || "user");
}

export function getLoginRedirectForSession(session: SessionPayload | null | undefined) {
  return "/";
}

export function unauthorizedJson(message = "Authentication required") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenJson(message = "You do not have access to this environment") {
  return NextResponse.json({ error: message }, { status: 403 });
}
