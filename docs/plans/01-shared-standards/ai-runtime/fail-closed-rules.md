# Fail-Closed Rules

## The principle

When in doubt, Winston must fail closed — returning null, refusing, or declaring missing context — rather than returning a plausible-sounding approximation.

An invented answer that looks right is worse than an honest null. The user acts on invented answers. They do not act on declared nulls.

## Mandatory fail-closed cases

### 1. Financial metrics without authoritative data (REPE)
- If a released period's financial metrics are requested and the authoritative snapshot is unavailable → return null with `null_reason: "snapshot_unavailable"`
- If the waterfall model is required for carry/promote/gp_share and is not available → return null with `null_reason: "out_of_scope_requires_waterfall"`
- NEVER approximate carry, IRR, or TVPI

### 2. Cross-tenant data requests
- If the request would return data outside the current env_id → refuse with `refused` terminal status
- Never serve data that would require crossing a tenant boundary, even for admins viewing another tenant's data without explicit switching

### 3. Unknown tool
- If Winston is asked to use a tool that is not registered in the MCP tool registry → return `tool_error` with message "tool not available in this environment"

### 4. Missing user context
- If a personalization or preference is required but no user context exists → return the generic response with a note that personalization is unavailable, not an invented preference

### 5. Stale or expired context
- If the session context is older than the configured TTL → warn the user that context may be stale before proceeding
- Do not silently serve stale data as if it were current

### 6. AI answer exceeds declared scope
- If the environment's `ai-behavior.md` defines a scope limit (e.g. "fund-level only, not investor-level") → refuse investor-level questions with a clear scope declaration

### 7. Sustainability metrics without a certified basis
- If a computed emission (e.g. tCO2e) would require an emission factor and no approved factor exists for this activity, factor-set version, and reporting period → return null with `null_reason: "emission_factor_missing"`
- If a metric key requested from the sustainability reader is not registered in the unified metric registry → return null with `null_reason: "metric_definition_missing"`
- If the value or report would require an external assurance the platform does not hold (v1 is internal decision-support only, not an assured or published disclosure) → return null with `null_reason: "out_of_certified_scope"`
- A missing source record for an (asset, period) already maps to the existing `data_not_ingested`; a missing released authoritative snapshot for a released (asset, period) already maps to the existing `snapshot_unavailable`. No new tokens are introduced for those two cases.
- NEVER fabricate an emission factor, invent a metric definition, or claim an assured or published value

## Null reason vocabulary

Standard null_reasons across all environments:

| null_reason | Meaning |
|---|---|
| `snapshot_unavailable` | Authoritative snapshot not found for this period |
| `out_of_scope_requires_waterfall` | Waterfall model required, not available |
| `data_not_ingested` | Source data has not been ingested yet |
| `permission_denied` | User does not have permission for this data |
| `tool_not_available` | Required MCP tool not registered |
| `context_expired` | Session context is too old to be reliable |
| `out_of_scope_environment` | Request exceeds this environment's declared scope |
| `no_relevant_documents` | RAG found no relevant context for this query |
| `model_not_promoted` | No promoted model version exists for the requested channel/model (Telemetry) |
| `channel_not_scored` | Channel exists but has no prediction rows yet (Telemetry) |
| `telemetry_findings_unavailable` | The telemetry analyzer could not be reached; the Spike Inspector renders no findings and names the reason (Telemetry) |
| `data_source_not_configured` | A skill's upstream data source (cloud warehouse/cost/lineage) is not wired in this build (ADE Ops) |
| `write_capability_not_enabled` | A write-capable (tier ≥2) operation was requested but writes are intentionally disabled (ADE Ops) |
| `receipt_write_failed` | A governed-decision receipt could not be persisted; result surfaced as degraded, never silently dropped or claimed as a phantom id (ADE Ops / AI Provider Dispatch) |
| `provider_not_configured` | Chosen dispatch provider is eligible but not configured/available; no fallback taken (AI Provider Dispatch) |
| `capability_unavailable` | Provider cannot serve the requested mode (AI Provider Dispatch) |
| `risk_tier_forbidden` | Provider's max risk tier is below the request's risk (AI Provider Dispatch) |
| `privacy_forbidden` | Provider's max privacy is below the request's privacy (AI Provider Dispatch) |
| `no_eligible_provider` | No provider can serve this mode/risk/privacy (AI Provider Dispatch) |
| `fallback_disabled` | Chosen provider unavailable and per-request fallback was not enabled (AI Provider Dispatch) |
| `emission_factor_missing` | No approved emission factor exists for this activity, factor-set version, and reporting period (Sustainability) |
| `metric_definition_missing` | The requested metric key is not registered in the unified metric registry (Sustainability) |
| `out_of_certified_scope` | The value or report would require an external assurance the platform does not hold; v1 is internal decision-support only (Sustainability) |

## Rule for eval coverage

Every null_reason must have a negative test in the environment's `eval-plan.md` that confirms: when the triggering condition exists, the null is returned with the correct null_reason — and the UI renders it gracefully (not as an error, not as empty, not as zero).
