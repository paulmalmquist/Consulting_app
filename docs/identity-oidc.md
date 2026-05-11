# Enterprise identity (OIDC)

Winston supports federated sign-in via Okta and Microsoft Entra ID. Both
providers run through one OIDC abstraction; adding a third provider is a
configuration row, not a code change.

The invite-code login at `POST /api/auth/login` (issuing `bos_session`)
and the Supabase password login (issuing `bm_session`) keep working
unchanged.

## Architecture

```
Browser                                Next.js                       FastAPI                       IdP
   │  click "Continue with Okta"          │                              │                          │
   ├──── GET /api/auth/oidc/start ───────►│                              │                          │
   │                                      │  GET /providers/public ─────►│                          │
   │                                      │◄──── public provider list ───┤                          │
   │                                      │  fetch /.well-known/...      │                          │
   │                                      │◄──── discovery doc ──────────────────────────────────────┤
   │                                      │  build state + nonce + PKCE                             │
   │                                      │  set oidc_pkce cookie                                   │
   │◄──── 302 to authorize_endpoint ──────┤                              │                          │
   │                                                                                              │
   ├──── login at IdP ──────────────────────────────────────────────────────────────────────────► │
   │                                                                                              │
   │◄──── 302 to /api/auth/oidc/callback?code=...&state=... ◄────────────────────────────────────┤
   ├──── GET /api/auth/oidc/callback ────►│                                                       │
   │                                      │  verify oidc_pkce signature + state                  │
   │                                      │  sanitize returnTo                                   │
   │                                      │  POST /api/auth/oidc/exchange ─►│                    │
   │                                      │  (x-bm-internal-auth)           │                    │
   │                                      │                                 │ POST token endpoint
   │                                      │                                 ├───────────────────►│
   │                                      │                                 │◄── id_token ───────┤
   │                                      │                                 │ validate sig/iss/  │
   │                                      │                                 │ aud/exp/nonce      │
   │                                      │                                 │ via JWKS           │
   │                                      │                                 │ resolve app_role   │
   │                                      │                                 │ via group mapping  │
   │                                      │                                 │ upsert identity    │
   │                                      │                                 │ rows, audit row    │
   │                                      │                                 │ mint bm_session    │
   │                                      │◄──── { session_jwt, return_to }─┤                    │
   │                                      │  set bm_session cookie                               │
   │◄──── 302 to return_to ───────────────┤                                                      │
```

Three principles drive the split:

- **Browser-facing endpoints live in Next.js.** `/start` and `/callback`
  are same-origin with the app, can set cookies on `novendor.ai`, and
  don't need to round-trip secrets to the backend just to redirect.
- **All token validation lives in FastAPI.** The Next.js routes never
  see the IdP signing keys or the client secret. The backend is the
  source of truth for `enabled`, JWKS, claim sanitization, and role
  resolution.
- **`bm_session` stays canonical.** The OIDC callback mints the same
  cookie shape the Supabase path issues. Middleware, `apiFetch`, and
  the environment switcher are unchanged.

## Required environment variables

| Var | Where | Purpose |
| --- | --- | --- |
| `OIDC_INTERNAL_EXCHANGE_SECRET` | Both | Authenticates the Next.js → FastAPI callback exchange. Never exposed to the browser. Generate with `openssl rand -hex 32`. |
| `BM_SESSION_SECRET` | Both | HMAC secret for `bm_session` and the `oidc_pkce` cookie. Already required by the existing Supabase login flow. |
| `OIDC_PKCE_COOKIE_SECRET` | Next.js (optional) | Override secret for the `oidc_pkce` cookie. Falls back to `BM_SESSION_SECRET`. |
| `OKTA_ISSUER` | Backend (seed) | Okta issuer URL, e.g. `https://acme.okta.com`. |
| `OKTA_CLIENT_ID` | Backend (seed) | Okta app client ID. |
| `OKTA_AUDIENCE` | Backend (seed) | Defaults to the client ID. Set when Okta is fronting an authorization server with a separate audience. |
| `OKTA_DISCOVERY_URL` | Backend (seed) | Optional override. Defaults to `{issuer}/.well-known/openid-configuration`. |
| `OKTA_CLIENT_SECRET` | Backend | Confidential client secret. Used at `/exchange` only. Never logged or persisted. |
| `OKTA_DEFAULT_ROLE` | Backend (seed) | Default `app_role` for users whose groups do not match the mapping. `viewer` if unset. |
| `ENTRA_TENANT_ID` | Backend (seed) | Entra tenant GUID. Derives the issuer and discovery URL. |
| `ENTRA_CLIENT_ID` | Backend (seed) | Entra app registration client ID. |
| `ENTRA_AUDIENCE` | Backend (seed) | Defaults to the client ID. |
| `ENTRA_CLIENT_SECRET` | Backend | Entra app client secret. Same rules as Okta. |
| `ENTRA_DEFAULT_ROLE` | Backend (seed) | Default `app_role`. `viewer` if unset. |

After setting these on the backend host, run the seed script once:

```bash
python backend/scripts/seed_identity_providers.py
```

The script upserts an `app.identity_providers` row per provider. Rows are
written `enabled = false` when any required field is missing so the
Identity admin UI can flip them on after a human reviews the claim and
group mappings.

## Okta setup

1. In the Okta admin console, create a new **OIDC Web Application**.
2. Sign-in redirect URI: `https://<your-domain>/api/auth/oidc/callback`.
3. Sign-out redirect URI: `https://<your-domain>/login`.
4. Grant types: **Authorization Code** + **Refresh Token** (refresh is
   optional for phase 1).
5. Capture the client ID + client secret. Set:
   ```
   OKTA_ISSUER=https://<tenant>.okta.com
   OKTA_CLIENT_ID=<client-id>
   OKTA_CLIENT_SECRET=<client-secret>
   ```
6. Create groups in Okta that match the `app_role`s you want to grant.
   Capture the **group IDs** (not display names) for the role mapping
   below. Group IDs look like `00gxxxxxxxxxxxxxxxxx`.
7. Run the seed script, then open `/lab/system/identity`, click "Test
   provider config" to confirm JWKS reachability, and fill in
   `claim_mapping` / `group_role_mapping` via direct SQL or the upcoming
   admin form.

## Microsoft Entra setup

1. In Entra ID, register a new application.
2. Redirect URI (web): `https://<your-domain>/api/auth/oidc/callback`.
3. Under **Token configuration**, add the `groups` optional claim
   (group object IDs, not display names).
4. Under **Certificates & secrets**, create a client secret.
5. Note the **Application (client) ID** and **Directory (tenant) ID**:
   ```
   ENTRA_TENANT_ID=<tenant-guid>
   ENTRA_CLIENT_ID=<client-id>
   ENTRA_CLIENT_SECRET=<client-secret>
   ```
6. Map group object IDs to `app_role` in `group_role_mapping`.

### Group overage

When a user is in too many groups, Entra emits `_claim_names.groups`
plus a `hasgroups` flag instead of the full ID list. Phase 1 treats
this as a deny-or-default: the user gets the provider's `default_role`
(or no `app_role` if none is configured). Microsoft Graph fallback is
a separate ticket.

## Claim mapping

`identity_providers.claim_mapping` is a JSON object that overrides which
ID-token claim populates which slot:

```json
{
  "email": "email",
  "name": "name",
  "groups": "groups",
  "tenant": "tid",
  "allow_extra": ["custom_org_id"]
}
```

- The defaults match standard OIDC: `sub` / `email` / `name` / `groups`
  / `tid`.
- `allow_extra` is the only path to persist non-standard claims. Anything
  not in the whitelist (or `allow_extra`) is dropped before
  `sanitized_claims` is written.

## Group → role mapping

`identity_providers.group_role_mapping` is keyed by **immutable group
ID** (Okta `00g...` or Entra group object ID) so renaming a group in the
IdP cannot accidentally grant or revoke access:

```json
{
  "00gFinance123": {
    "environment_slug": "novendor-internal",
    "app_role": "finance_admin"
  },
  "12345678-aaaa-bbbb-cccc-deadbeefcafe": {
    "business_id": "0e3...",
    "environment_id": "5b1...",
    "app_role": "operator"
  }
}
```

Scope fields are optional. If present they MUST all match the current
session's environment or business; mismatches cause the rule to be
skipped. Unknown groups fall through to `default_role`. There is no path
where an unknown group elevates to `admin`.

## Internal app roles

| Role | Capabilities (representative) |
| --- | --- |
| `viewer` | Read-only dashboards. Examples: `GET /api/operator/v1/command-center`, `GET /api/nv/accounting/queue`. |
| `operator` | Workflow execution. Examples: `POST /api/capital-projects/v1/.../draws/{id}/submit`, `POST /api/executions/run`. |
| `finance_admin` | Finance writes. Examples: `POST /api/fin/v1/funds/{fund_id}/distribution-events`, waterfall and capital-rollforward runs, `POST /api/trades/intents/{id}/approve`. |
| `admin` | Everything `finance_admin` can do plus environment and identity administration. |

App role checks live in `backend/app/auth/app_role_gate.py`. Every denial
records a `permission.denied` row in `app.audit_events` with the
attempted action, the role required, and the role the user had. That is
the audit receipt enterprise reviewers expect.

## Local development with mocked tokens

A test helper at `backend/tests/test_oidc_auth.py` shows the pattern:
mint an RS256-signed JWT with a local key, then monkey-patch
`OidcKeyResolver.get_signing_key` to return that key. This is the same
fixture used in CI. If you need to drive the full callback flow against
a local stub, run a mock OIDC server (for example
[`mock-oauth2-server`](https://github.com/navikt/mock-oauth2-server))
on port `8080`, seed an `identity_providers` row pointing at it, and
walk the flow in a real browser.

## Failure modes

| Scenario | UI behavior | Audit |
| --- | --- | --- |
| Provider row missing or `enabled = false` | Redirect to `/login?error=oidc_failed&reason=unknown_provider` (or `provider_disabled` at exchange time). No `bos_session` fallback. | `login.failure` with `error_message=provider_disabled`. |
| Invalid signature / wrong issuer / wrong audience | Redirect to `/login?error=oidc_failed&reason=invalid_audience` (etc.). | `login.failure` with the matching code. |
| Expired token | Redirect to `/login?error=oidc_failed&reason=token_expired`. | `login.failure`. |
| `state` cookie mismatch (CSRF / replay) | Redirect to `/login?error=oidc_failed&reason=state_mismatch`. PKCE cookie cleared. | No audit row (request never reached the backend). |
| `returnTo` is external | Treated as `/app`. No external redirect ever leaves the callback. | n/a. |
| Entra group overage | User logs in with `default_role` or is denied if none is set. | `group_overage_unsupported` event. |
| Unknown group | `default_role` if configured, otherwise no role written. | `login.success` with `role_reason=default` or `no_match`. |
| Action denied by `app_role` | Frontend renders the "Not authorized" recovery card. | `permission.denied` with `action_attempted` and `user_app_role`. |

## Demo script

1. Open `/lab/system/identity` (admin only). Two provider cards render —
   Okta and Microsoft — with masked client IDs and a health pill.
2. Click "Test provider config" on each. The pill flips to green and the
   "Last check" timestamp updates.
3. Sign out, open `/login`, click "Continue with Okta", complete the
   IdP login. Land on `/app` with `bm_session` set.
4. Check `app.external_identities` — there is a row joining the Okta
   subject to the platform user.
5. Open a viewer-allowed dashboard at `/app/...`. The page loads.
6. Trigger a finance-admin action (the seeded user only has `operator`).
   The UI renders the "Not authorized" card.
7. Open `/lab/system/identity` → "Recent auth events". There is a
   `permission.denied` row with the attempted action and the role the
   user had.
8. Update the Okta group → `finance_admin` mapping (or assign the user
   to a finance_admin group), sign in again, retry the action. It
   succeeds.
