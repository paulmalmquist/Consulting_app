import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  generateRandomToken,
  signEnvelope,
  sanitizeReturnTo,
  verifyEnvelope,
  type OidcPkceEnvelope,
} from "@/lib/server/oidcPkce";

beforeEach(() => {
  process.env.BM_SESSION_SECRET = "test-secret-for-pkce-cookie";
  process.env.OIDC_INTERNAL_EXCHANGE_SECRET = "test-internal-secret";
});

afterEach(() => {
  vi.restoreAllMocks();
});

function buildEnvelope(overrides: Partial<OidcPkceEnvelope> = {}): OidcPkceEnvelope {
  return {
    provider_id: "p-1",
    provider_name: "okta",
    state: generateRandomToken(),
    nonce: generateRandomToken(),
    code_verifier: generateRandomToken(48),
    redirect_uri: "https://app.example.com/api/auth/oidc/callback",
    return_to: "/app",
    iat: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

describe("oidcPkce helpers", () => {
  it("roundtrips an envelope through sign/verify", () => {
    const envelope = buildEnvelope();
    const token = signEnvelope(envelope);
    const verified = verifyEnvelope(token);
    expect(verified?.state).toBe(envelope.state);
    expect(verified?.nonce).toBe(envelope.nonce);
  });

  it("rejects tampered payloads", () => {
    const envelope = buildEnvelope();
    const token = signEnvelope(envelope);
    const tampered = token.replace(/.$/, "x");
    expect(verifyEnvelope(tampered)).toBeNull();
  });

  it("rejects an envelope older than the TTL", () => {
    const envelope = buildEnvelope({ iat: Math.floor(Date.now() / 1000) - 3600 });
    const token = signEnvelope(envelope);
    expect(verifyEnvelope(token)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(verifyEnvelope(null)).toBeNull();
    expect(verifyEnvelope("")).toBeNull();
    expect(verifyEnvelope("not-a-valid-token")).toBeNull();
  });
});

describe("sanitizeReturnTo", () => {
  it("accepts relative paths", () => {
    expect(sanitizeReturnTo("/app/dashboard")).toBe("/app/dashboard");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeReturnTo("//evil.com")).toBe("/app");
  });

  it("rejects absolute external URLs", () => {
    expect(sanitizeReturnTo("https://evil.com/steal")).toBe("/app");
  });

  it("rejects javascript: pseudo URLs", () => {
    // The startsWith("/") guard catches anything not relative.
    expect(sanitizeReturnTo("javascript:alert(1)")).toBe("/app");
  });

  it("defaults missing values to /app", () => {
    expect(sanitizeReturnTo(undefined)).toBe("/app");
    expect(sanitizeReturnTo(null)).toBe("/app");
    expect(sanitizeReturnTo("")).toBe("/app");
  });
});

function buildNextRequest(url: string, cookieHeader?: string): NextRequest {
  return new NextRequest(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

describe("callback route fail-closed behavior", () => {
  it("redirects to /login?error=oidc_failed when state cookie mismatches", async () => {
    const { GET } = await import("../callback/route");
    const validEnvelope = buildEnvelope();
    const cookieValue = signEnvelope(validEnvelope);

    const request = buildNextRequest(
      "https://app.example.com/api/auth/oidc/callback?code=abc&state=DIFFERENT_STATE",
      `oidc_pkce=${cookieValue}`,
    );
    const response = await GET(request);
    expect(response.status).toBe(307); // Next redirect
    const location = response.headers.get("location") || "";
    expect(location).toContain("/login");
    expect(location).toContain("error=oidc_failed");
    expect(location).toContain("reason=state_mismatch");
  });

  it("redirects when the PKCE cookie is missing", async () => {
    const { GET } = await import("../callback/route");
    const request = buildNextRequest(
      "https://app.example.com/api/auth/oidc/callback?code=abc&state=zzz",
    );
    const response = await GET(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("reason=invalid_pkce_cookie");
  });

  it("redirects when the IdP returned an error", async () => {
    const { GET } = await import("../callback/route");
    const request = buildNextRequest(
      "https://app.example.com/api/auth/oidc/callback?error=access_denied",
    );
    const response = await GET(request);
    expect(response.headers.get("location")).toContain("reason=idp_access_denied");
  });
});
