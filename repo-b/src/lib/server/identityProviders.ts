/**
 * Server-side typed client for the backend identity-provider endpoints.
 *
 * Public list (no auth) is used by the OIDC start route. Admin list and
 * health-check actions are used by the Identity admin page (gated by the
 * /lab/system layout).
 */

export type IdentityProviderPublic = {
  identity_provider_id: string;
  provider_name: string;
  kind: "okta" | "azure_ad" | "generic_oidc";
  issuer: string;
  client_id: string;
  discovery_url: string | null;
  audience: string | null;
};

export type IdentityProviderAdmin = {
  identity_provider_id: string;
  provider_name: string;
  kind: "okta" | "azure_ad" | "generic_oidc";
  issuer: string;
  client_id_masked: string | null;
  audience: string | null;
  discovery_url: string | null;
  jwks_uri: string | null;
  enabled: boolean;
  claim_mapping: Record<string, unknown>;
  group_role_mapping: Record<string, unknown>;
  default_role: string | null;
  last_health_check_at: string | null;
  last_health_status: string | null;
  last_health_detail: string | null;
};

export type IdentityHealthResult = {
  provider_id: string;
  status: "ok" | "warn" | "error";
  detail: string;
};

export type AuditEvent = {
  audit_event_id: string;
  actor: string;
  action: string;
  tool_name: string;
  success: boolean;
  created_at: string;
  input_redacted: Record<string, unknown> | null;
  error_message: string | null;
};

function backendOrigin(): string {
  return (
    process.env.BOS_API_ORIGIN ||
    process.env.BACKEND_ORIGIN ||
    process.env.NEXT_PUBLIC_BACKEND_ORIGIN ||
    "http://localhost:8000"
  ).replace(/\/$/, "");
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendOrigin()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`backend ${response.status}: ${detail.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

export async function listIdentityProvidersPublic(): Promise<IdentityProviderPublic[]> {
  const data = await fetchJson<{ providers: IdentityProviderPublic[] }>(
    "/api/auth/oidc/providers/public",
  );
  return data.providers;
}

export async function listIdentityProvidersAdmin(
  forwardCookieHeader: string | null,
): Promise<IdentityProviderAdmin[]> {
  const data = await fetchJson<{ providers: IdentityProviderAdmin[] }>(
    "/api/auth/oidc/providers",
    {
      headers: forwardCookieHeader ? { cookie: forwardCookieHeader } : {},
    },
  );
  return data.providers;
}

export async function testIdentityProvider(
  providerId: string,
  forwardCookieHeader: string | null,
): Promise<IdentityHealthResult> {
  return fetchJson<IdentityHealthResult>(`/api/auth/oidc/test/${providerId}`, {
    method: "POST",
    headers: forwardCookieHeader ? { cookie: forwardCookieHeader } : {},
  });
}

export async function listIdentityAuditEvents(
  forwardCookieHeader: string | null,
  limit = 25,
): Promise<AuditEvent[]> {
  const data = await fetchJson<{ events: AuditEvent[] }>(
    `/api/auth/oidc/audit-events?limit=${limit}`,
    {
      headers: forwardCookieHeader ? { cookie: forwardCookieHeader } : {},
    },
  );
  return data.events;
}

/** Internal call used by the OIDC callback route only. */
export async function exchangeAuthCode(body: {
  provider_id: string;
  code: string;
  code_verifier: string;
  nonce: string | null;
  redirect_uri: string;
  returnTo: string;
}): Promise<{
  session_jwt: string;
  return_to: string;
  email: string;
  platform_user_id: string;
}> {
  const secret = (process.env.OIDC_INTERNAL_EXCHANGE_SECRET || "").trim();
  if (!secret) throw new Error("OIDC_INTERNAL_EXCHANGE_SECRET not configured");
  return fetchJson("/api/auth/oidc/exchange", {
    method: "POST",
    headers: { "x-bm-internal-auth": secret },
    body: JSON.stringify(body),
  });
}

/** Read the OIDC authorize endpoint URL from the IdP's discovery document. */
export async function resolveAuthorizeEndpoint(provider: IdentityProviderPublic): Promise<{
  authorization_endpoint: string;
  scopes: string[];
}> {
  const url =
    provider.discovery_url ||
    `${provider.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`discovery ${response.status}`);
  const doc = (await response.json()) as {
    authorization_endpoint?: string;
    scopes_supported?: string[];
  };
  if (!doc.authorization_endpoint) throw new Error("discovery missing authorization_endpoint");
  const wantedScopes = ["openid", "profile", "email"];
  if (provider.kind === "azure_ad") wantedScopes.push("offline_access");
  const supported = new Set(doc.scopes_supported || []);
  const scopes = supported.size
    ? wantedScopes.filter((s) => supported.has(s))
    : wantedScopes;
  return {
    authorization_endpoint: doc.authorization_endpoint,
    scopes: scopes.length ? scopes : wantedScopes,
  };
}
