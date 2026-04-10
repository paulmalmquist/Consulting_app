#!/usr/bin/env node
/**
 * Authoritative State Lockdown — Phase 2 verification session minter.
 *
 * Self-contained Node script that produces a signed `bm_session` cookie
 * value compatible with repo-b/src/lib/server/sessionAuth.ts. The
 * verification harness uses this so that meridian_surface_probe.mjs and
 * meridian_verification_run.py can authenticate against the live
 * Meridian and Stone PDS pages on www.paulmalmquist.com.
 *
 * Why a separate helper:
 * - The Next.js sessionAuth.ts module imports next/server and other
 *   bundler-only modules; we cannot import it from a standalone CLI.
 * - The cookie format is small enough to replicate exactly: HMAC-SHA256
 *   over base64url(JSON(claims)) using BM_SESSION_SECRET.
 *
 * Usage:
 *   PLATFORM_SESSION_SECRET=... node sign_verification_session.mjs --json
 *   PLATFORM_SESSION_SECRET=... node sign_verification_session.mjs
 *
 * Output (default): `<cookie-name>=<token>` on stdout.
 * Output (--json): { name, value, expires_at, claims } JSON object.
 *
 * Environment variables:
 *   - PLATFORM_SESSION_SECRET (required): the same secret as
 *     BM_SESSION_SECRET / AUTH_SESSION_SECRET on the Vercel deploy.
 *   - VERIFICATION_USER_EMAIL (optional): defaults to verification@meridian.local
 *   - VERIFICATION_TTL_SECONDS (optional): defaults to 86400 (24h).
 *
 * The minted session has memberships in:
 *   - Meridian env a1b2c3d4-0001-0001-0003-000000000001
 *   - Stone PDS env a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2
 *
 * The verification user must exist as a row in bm_user_membership for
 * those envs. Phase 2 of the lockdown adds them via re_fi_seed.py.
 *
 * See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.
 */

import crypto from "node:crypto";
import process from "node:process";

const COOKIE_NAME = "bm_session";
const SESSION_VERSION = 1;

const MERIDIAN_ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001";
const STONE_ENV_ID = "a2ac9edd-fa26-4ca0-bf96-f64f1fee91f2";

function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signHmac(payloadString, secret) {
  return toBase64Url(
    crypto.createHmac("sha256", secret).update(payloadString).digest(),
  );
}

function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

function buildClaims() {
  const ttl = Number(process.env.VERIFICATION_TTL_SECONDS || 86400);
  const issuedAt = nowInSeconds();
  const expiresAt = issuedAt + ttl;
  const email = process.env.VERIFICATION_USER_EMAIL || "verification@meridian.local";
  // platform_user_id is a stable label so the audit trail can identify
  // verification activity. The actual permission grant is via the
  // memberships array below; if either env is missing in the DB, the
  // surface probe will still see a 302 to the access-denied page.
  return {
    v: SESSION_VERSION,
    session_id: `verification-${issuedAt}`,
    platform_user_id: "verification-user",
    supabase_user_id: null,
    email,
    display_name: "Verification Harness",
    issued_at: issuedAt,
    expires_at: expiresAt,
    platform_admin: true,
    active_env_id: MERIDIAN_ENV_ID,
    active_env_slug: "meridian",
    active_role: "admin",
    memberships: [
      {
        env_id: MERIDIAN_ENV_ID,
        env_slug: "meridian",
        client_name: "Meridian Capital",
        role: "admin",
        status: "active",
        auth_mode: "private",
        is_default: true,
        business_id: null,
        tenant_id: null,
        industry: null,
        industry_type: null,
        workspace_template_key: null,
      },
      {
        env_id: STONE_ENV_ID,
        env_slug: "stone-pds",
        client_name: "Stone PDS",
        role: "admin",
        status: "active",
        auth_mode: "private",
        is_default: false,
        business_id: null,
        tenant_id: null,
        industry: null,
        industry_type: null,
        workspace_template_key: null,
      },
    ],
  };
}

function mintSessionToken(secret) {
  const claims = buildClaims();
  const payload = toBase64Url(JSON.stringify(claims));
  const signature = signHmac(payload, secret);
  return { token: `${payload}.${signature}`, claims };
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");

  const secret = (
    process.env.PLATFORM_SESSION_SECRET ||
    process.env.BM_SESSION_SECRET ||
    process.env.AUTH_SESSION_SECRET ||
    ""
  ).trim();

  if (!secret) {
    console.error(
      "sign_verification_session: PLATFORM_SESSION_SECRET (or BM_SESSION_SECRET/AUTH_SESSION_SECRET) is required",
    );
    process.exit(2);
  }

  const { token, claims } = mintSessionToken(secret);

  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        {
          name: COOKIE_NAME,
          value: token,
          expires_at: claims.expires_at,
          claims,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(`${COOKIE_NAME}=${token}\n`);
  }
}

main();
