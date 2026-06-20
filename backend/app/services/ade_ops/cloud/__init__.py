"""Read-only cloud provider inventory adapters for ADE Ops (PR 3).

Adapters detect whether a provider's telemetry is configured, normalize whatever
read-only metadata is available into ONE shared ProviderInventoryObservation
model (never four bespoke payloads), and fail closed with an explicit null_reason
when a CLI/auth/account/project/workspace/region is missing.

Strict PR 3 invariants:
  - READ-ONLY. No adapter constructs, allowlists, or executes a write/mutating
    command. The only commands an adapter would ever run are list/describe/SELECT.
  - No recommendations, no dry-run patches, no right-sizing logic. Adapters
    expose *availability* of runtime/cost/freshness observation; they do not
    optimize. ``rightsizing_candidate_available`` is always False in PR 3.
  - No credentials required in CI. Tests feed mocked CLI/query output; adapters
    never reach a real provider in tests.
"""
