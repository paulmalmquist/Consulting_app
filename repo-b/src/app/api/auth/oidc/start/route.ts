import { NextRequest, NextResponse } from "next/server";

import {
  cookieMaxAgeSeconds,
  generateCodeChallenge,
  generateRandomToken,
  OIDC_PKCE_COOKIE,
  sanitizeReturnTo,
  signEnvelope,
} from "@/lib/server/oidcPkce";
import {
  listIdentityProvidersPublic,
  resolveAuthorizeEndpoint,
} from "@/lib/server/identityProviders";

export const runtime = "nodejs";

function isSecure() {
  return process.env.NODE_ENV === "production";
}

function originFromRequest(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") || (isSecure() ? "https" : "http");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const providerName = (url.searchParams.get("provider") || "").trim().toLowerCase();
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  if (!providerName) {
    return NextResponse.redirect(
      new URL("/login?error=oidc_failed&reason=missing_provider", url),
    );
  }

  let providers;
  try {
    providers = await listIdentityProvidersPublic();
  } catch (error) {
    console.error("[oidc/start] backend providers fetch failed", error);
    return NextResponse.redirect(
      new URL("/login?error=oidc_failed&reason=providers_unavailable", url),
    );
  }

  const provider = providers.find((p) => p.provider_name.toLowerCase() === providerName);
  if (!provider) {
    return NextResponse.redirect(
      new URL("/login?error=oidc_failed&reason=unknown_provider", url),
    );
  }

  let discovery;
  try {
    discovery = await resolveAuthorizeEndpoint(provider);
  } catch (error) {
    console.error("[oidc/start] discovery failed", error);
    return NextResponse.redirect(
      new URL("/login?error=oidc_failed&reason=discovery_unavailable", url),
    );
  }

  const state = generateRandomToken();
  const nonce = generateRandomToken();
  const codeVerifier = generateRandomToken(48);
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const redirectUri = `${originFromRequest(request)}/api/auth/oidc/callback`;

  const envelope = {
    provider_id: provider.identity_provider_id,
    provider_name: provider.provider_name,
    state,
    nonce,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    return_to: returnTo,
    iat: Math.floor(Date.now() / 1000),
  };

  const authorize = new URL(discovery.authorization_endpoint);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", provider.client_id);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", discovery.scopes.join(" "));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  authorize.searchParams.set("code_challenge", codeChallenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorize.toString());
  response.cookies.set({
    name: OIDC_PKCE_COOKIE,
    value: signEnvelope(envelope),
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure(),
    path: "/api/auth/oidc",
    maxAge: cookieMaxAgeSeconds(),
  });
  return response;
}
