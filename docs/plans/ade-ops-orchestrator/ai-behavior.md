# AI behavior — ADE Ops Orchestrator

## Hard boundaries (the agent wall)
AI **may**: recommend, summarize, classify, draft tickets, generate dry-run patches.
AI **may not**: apply prod changes without approval · invent missing data · mark
stale data as current · change metric definitions without owner approval · run
arbitrary shell commands · backfill locked finance periods without authorization.

## Risk tiers
`0` read-only inventory · `1` recommendation only · `2` dry-run patch/ticket ·
`3` non-prod write · `4` prod write · `5` rollback/emergency. PR 1 executes only
tiers 0–1. The supervisor refuses tier ≥2 (and any non-executable skill) before
the executor is even looked up — no write path is reachable.

## Fail-closed null_reasons (this layer)
- `data_source_not_configured` — upstream cloud source not wired in this build.
- `write_capability_not_enabled` — a tier ≥2 op was requested; writes disabled.
- `receipt_write_failed` — receipt could not persist; result is `degraded`, never silent.
- `invalid_inputs` / `unknown_skill` / `auth_context_unavailable` /
  `durable_source_unavailable` / `unsupported_command_input` — diagnostics.

## No fabrication
Every `Evidence` item carries a non-empty `source`. A result is `ok`/`degraded`
with sourced evidence, or `blocked` with a `null_reason` — never a recommendation
backed by empty/invented evidence. The UI renders `null_reason` as a reason, not
as an error, empty, or zero.
