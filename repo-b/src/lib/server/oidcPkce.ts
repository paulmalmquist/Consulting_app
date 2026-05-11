/**
 * OIDC PKCE + state cookie utilities.
 *
 * The ``oidc_pkce`` cookie is a short-lived HMAC-signed JSON envelope holding
 * everything the callback needs to validate the round-trip:
 *
 *   { provider_id, state, nonce, code_verifier, redirect_uri, return_to, iat }
 *
 * Cookie attributes: HttpOnly, Secure in production, SameSite=Lax,
 * Path=/api/auth/oidc, Max-Age <= 600 seconds. The signing secret is the
 * same ``BM_SESSION_SECRET`` used for ``bm_session`` so we do not introduce
 * a third secret to manage.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";

export const OIDC_PKCE_COOKIE = "oidc_pkce";
const COOKIE_TTL_SECONDS = 600;

export type OidcPkceEnvelope = {
  provider_id: string;
  provider_name: string;
  state: string;
  nonce: string;
  code_verifier: string;
  redirect_uri: string;
  return_to: string;
  iat: number;
};

function secret(): string {
  const value = (
    process.env.OIDC_PKCE_COOKIE_SECRET ||
    process.env.BM_SESSION_SECRET ||
    process.env.AUTH_SESSION_SECRET ||
    ""
  ).trim();
  if (!value) throw new Error("OIDC cookie secret not configured");
  return value;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4 || 4)) % 4;
  return Buffer.from(padded + "=".repeat(pad), "base64");
}

export function generateRandomToken(byteLen = 32): string {
  return base64UrlEncode(randomBytes(byteLen));
}

export function generateCodeChallenge(codeVerifier: string): string {
  return base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
}

export function signEnvelope(envelope: OidcPkceEnvelope): string {
  const payload = base64UrlEncode(Buffer.from(JSON.stringify(envelope), "utf-8"));
  const sig = createHmac("sha256", secret()).update(payload).digest();
  return `${payload}.${base64UrlEncode(sig)}`;
}

export function verifyEnvelope(token: string | null | undefined): OidcPkceEnvelope | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest();
  let actual: Buffer;
  try {
    actual = base64UrlDecode(signature);
  } catch {
    return null;
  }
  if (actual.length !== expected.length) return null;
  // Timing-safe equality.
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected[i] ^ actual[i];
  if (diff !== 0) return null;
  try {
    const json = base64UrlDecode(payload).toString("utf-8");
    const parsed = JSON.parse(json) as OidcPkceEnvelope;
    if (!parsed.state || !parsed.nonce || !parsed.code_verifier) return null;
    if (typeof parsed.iat !== "number" || Date.now() / 1000 - parsed.iat > COOKIE_TTL_SECONDS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function cookieMaxAgeSeconds(): number {
  return COOKIE_TTL_SECONDS;
}

/** Reject obvious open-redirect targets. ``return_to`` must be a relative path. */
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value) return "/app";
  if (typeof value !== "string") return "/app";
  // Must start with a single slash and not be protocol-relative.
  if (!value.startsWith("/")) return "/app";
  if (value.startsWith("//")) return "/app";
  if (value.includes("://")) return "/app";
  return value;
}
