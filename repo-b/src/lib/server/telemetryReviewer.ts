// Scoped "telemetry reviewer" login — a dedicated, read-only credential that grants access ONLY to
// the Telemetry Demo Console env (`/lab/env/<ENV>/telemetry*` + the public `/api/telemetry/*` proxy).
//
// It does NOT touch the Supabase / info@novendor.ai admin path. It mints a normal signed `bm_session`
// whose single membership is the telemetry env with role `telemetry_reviewer` and platform_admin
// false; `middleware.ts` confines that role to the telemetry routes. No DB row, no Supabase user.
//
// Fail closed: if any of the three env vars is unset, the reviewer login is DISABLED (config() returns
// null) and the route returns a normal auth error — it never silently opens access.
//
// Pure + runtime-agnostic (no node-only APIs) so it can be imported from both the edge middleware and
// the node API route.
import {
  buildSessionExpiryTimestampSeconds,
  type PlatformMembershipSlim,
  type PlatformSessionClaims,
  type SessionPayload,
} from "@/lib/server/sessionAuth";

export const TELEMETRY_REVIEWER_ROLE = "telemetry_reviewer";

export type TelemetryReviewerConfig = {
  username: string;
  password: string;
  envId: string;
};

/** Reads the reviewer credentials from env. Returns null (disabled / fail-closed) unless ALL three set. */
export function telemetryReviewerConfig(): TelemetryReviewerConfig | null {
  const username = (process.env.TELEMETRY_REVIEWER_USERNAME || "").trim();
  const password = process.env.TELEMETRY_REVIEWER_PASSWORD || "";
  const envId = (process.env.TELEMETRY_REVIEWER_ENV_ID || "").trim();
  if (!username || !password || !envId) return null;
  return { username, password, envId };
}

/** Constant-time-ish string compare (length leak only) — no node `crypto` so it stays edge-safe. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Verify submitted username/password against the configured reviewer credential. */
export function verifyTelemetryReviewer(username: string, password: string): TelemetryReviewerConfig | null {
  const cfg = telemetryReviewerConfig();
  if (!cfg) return null;
  if ((username || "").trim() !== cfg.username) return null;
  if (!safeEqual(password || "", cfg.password)) return null;
  return cfg;
}

/** Build the scoped session claims (+ the single membership) for a verified reviewer. */
export function buildTelemetryReviewerClaims(envId: string): {
  claims: PlatformSessionClaims;
  membership: PlatformMembershipSlim;
} {
  // env_slug must be a real EnvironmentSlug for typing; the telemetry env lives under the Novendor
  // workspace. This grants nothing extra — the middleware gate blocks every route except the env's
  // /telemetry pages, including the /novendor slug surfaces.
  const membership: PlatformMembershipSlim = {
    env_id: envId,
    env_slug: "novendor",
    role: TELEMETRY_REVIEWER_ROLE,
    status: "active",
    is_default: true,
  };
  const now = Math.floor(Date.now() / 1000);
  const claims: PlatformSessionClaims = {
    v: 1,
    session_id: globalThis.crypto.randomUUID(),
    platform_user_id: "telemetry-reviewer",
    supabase_user_id: null,
    email: "telemetry-reviewer@local", // intentionally NOT @novendor.ai (never bootstraps admin)
    display_name: "Telemetry Reviewer",
    issued_at: now,
    expires_at: buildSessionExpiryTimestampSeconds(),
    platform_admin: false,
    active_env_id: envId,
    active_env_slug: "novendor",
    active_role: TELEMETRY_REVIEWER_ROLE,
    memberships: [membership],
  };
  return { claims, membership };
}

type SessionLike = Pick<SessionPayload, "active_role" | "active_env_id" | "memberships"> | null | undefined;

/** True if this session was minted as a telemetry reviewer (role on active or any membership). */
export function isTelemetryReviewerSession(session: SessionLike): boolean {
  if (!session) return false;
  if (session.active_role === TELEMETRY_REVIEWER_ROLE) return true;
  return (session.memberships || []).some((m) => m.role === TELEMETRY_REVIEWER_ROLE);
}

/** The env id this reviewer is scoped to (from the signed session, not env vars). */
export function telemetryReviewerEnvId(session: SessionLike): string | null {
  if (!session) return null;
  const fromMembership = (session.memberships || []).find((m) => m.role === TELEMETRY_REVIEWER_ROLE)?.env_id;
  return fromMembership || session.active_env_id || null;
}

export function telemetryReviewerHome(envId: string): string {
  return `/lab/env/${envId}/telemetry`;
}

/** The ONLY routes a telemetry reviewer may reach: its env's /telemetry page tree. */
export function telemetryReviewerAllowedPath(pathname: string, envId: string | null): boolean {
  if (!envId) return false;
  const base = `/lab/env/${envId}/telemetry`;
  return pathname === base || pathname.startsWith(`${base}/`);
}
