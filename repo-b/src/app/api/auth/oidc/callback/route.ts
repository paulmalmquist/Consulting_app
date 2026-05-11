import { NextRequest, NextResponse } from "next/server";

import {
  OIDC_PKCE_COOKIE,
  sanitizeReturnTo,
  verifyEnvelope,
} from "@/lib/server/oidcPkce";
import { exchangeAuthCode } from "@/lib/server/identityProviders";
import { PLATFORM_SESSION_COOKIE } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

function isSecure() {
  return process.env.NODE_ENV === "production";
}

function failRedirect(request: NextRequest, reason: string): NextResponse {
  const response = NextResponse.redirect(
    new URL(`/login?error=oidc_failed&reason=${encodeURIComponent(reason)}`, request.url),
  );
  // Always clear the PKCE cookie on failure.
  response.cookies.set({
    name: OIDC_PKCE_COOKIE,
    value: "",
    maxAge: 0,
    path: "/api/auth/oidc",
  });
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const idpError = url.searchParams.get("error");
  const pkceToken = request.cookies.get(OIDC_PKCE_COOKIE)?.value || null;

  if (idpError) {
    return failRedirect(request, `idp_${idpError}`);
  }
  if (!code || !state) {
    return failRedirect(request, "missing_code_or_state");
  }

  const envelope = verifyEnvelope(pkceToken);
  if (!envelope) {
    return failRedirect(request, "invalid_pkce_cookie");
  }
  if (envelope.state !== state) {
    return failRedirect(request, "state_mismatch");
  }

  const returnTo = sanitizeReturnTo(envelope.return_to);

  let result;
  try {
    result = await exchangeAuthCode({
      provider_id: envelope.provider_id,
      code,
      code_verifier: envelope.code_verifier,
      nonce: envelope.nonce,
      redirect_uri: envelope.redirect_uri,
      returnTo,
    });
  } catch (error) {
    console.error("[oidc/callback] exchange failed", error);
    const reason =
      error instanceof Error && error.message.includes("backend ")
        ? error.message.split(":")[0].replace("backend ", "backend_")
        : "exchange_failed";
    return failRedirect(request, reason);
  }

  const safeReturnTo = sanitizeReturnTo(result.return_to);
  const response = NextResponse.redirect(new URL(safeReturnTo, request.url));
  response.cookies.set({
    name: PLATFORM_SESSION_COOKIE,
    value: result.session_jwt,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure(),
    path: "/",
  });
  response.cookies.set({
    name: OIDC_PKCE_COOKIE,
    value: "",
    maxAge: 0,
    path: "/api/auth/oidc",
  });
  return response;
}
