# Roadmap — Healthcare Subscription Analytics

## Phase 0 — Planning / skeleton ✅ (2026-06-08)
Plan folder, dispatch record 0005, proof docs, `hha_` prefix registration, routing.

## Phase 1 — HHA-1: Exec Overview vertical slice ✅ (2026-06-08)
- 5 `hha_*` gold-rollup tables + RLS (`10013_…sql`).
- `hha_starter` seed pack (synthetic, deterministic, PHI-free, one suppressed small cell).
- `healthcare_subscription` v2 template row.
- Read API: `GET /api/hha/v1/health`, `GET /api/hha/v1/overview`.
- Standalone Exec Overview page (no app shell) with NO-PHI banner, metric drawer, provenance footer.
- `backend/tests/test_hha.py` (6 tests).

## Phase 2 — Funnel + Cohorts + Operations 🟡 (built, draft PR #136 — NOT merged/deployed)
- `GET /api/hha/v1/funnel`, `/cohorts`, `/operations`; matching standalone pages. Built + locally
  verified (9 backend tests; review clean). **Not yet merged, not deployed, no production receipt.**
- Cohort retention grid surfaces `is_suppressed` (masked service-side — no counts leak).
- Channel LTV:CAC documented-unavailable (seeded LTV is blended channel='all' only).
- **Next:** flip #136 ready → merge → backend deploy from a clean checkout → production visual receipt.

## Phase 3 — Event-level grain + derived rollups (planned; prompt: `PHASE3_CODEX_PROMPT.md`)
- **Gated:** does not start until HHA-2 is merged, backend-deployed, and production receipt-tested.
  Its own PR (separate from Phase 4).
- Add 7 synthetic event tables (`hha_members`, `hha_subscriptions`, `hha_funnel_events`,
  `hha_lab_orders`, `hha_consults`, `hha_fulfillment_events`, `hha_support_tickets`) — schema `10014`
  (re-check vs origin/main). Synthetic ids + categorical/aggregate fields only; full RLS; no PHI.
- **Preserve v1** seed logic before adding v2; derive the 5 gold rollups from events; flip provenance
  `seeded → derived`. Acceptance = headline KPIs within tolerance + stable trends/rankings/suppression.
- Reconcile the demo by **wipe + re-seed `ceeb9ea0`** (same env_id) — destructive, gated, with a real
  backup-table rollback artifact, scratch-env verify first, and explicit approval at execution.

## Phase 4 — Governed PHI-safe copilot (planned; prompt: `PHASE4_CODEX_PROMPT.md`)
- **Gated:** after Phase 3. Its own PR. Reuses the existing Winston AI runtime (no parallel stack).
- Scope-label guardrail in `prompt_registry.py` (mirror Meridian); pre-model medical-advice refusal
  (lab-*operations* analytics allowed, individual lab-*result* interpretation refused).
- **Fixed-intent** MCP tool `hha.aggregate_query` (allow-listed intents — no free text-to-SQL, no
  identifier columns, small-cell suppression). Audit via existing `ai_decision_audit_log` (no new
  tables). Standalone copilot + governance pages (telemetry pattern).
- See [ai-behavior.md](ai-behavior.md).

Each phase gate requires: tests/receipts, updated `PROOF.md`/`release-readiness.md`, and updated
`next-session.md`. No phase starts without explicit approval. Phase 3 and Phase 4 are separate PRs.
