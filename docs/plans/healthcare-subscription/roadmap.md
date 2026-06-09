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

## Phase 2 — Funnel + Cohorts + Operations ✅ SHIPPED (2026-06-09)
- Read APIs + standalone pages for Funnel, Cohorts, Operations. Cohort suppression enforced
  service-side (masked pilot row = month/channel/marker/reason only). Channel LTV:CAC remains
  open (channel-specific LTV not at the seeded grain — Phase 3 events can supply it).
- PR #136 merged → `main` `caa57840`; frontend + backend deployed; production logged-in receipt
  on all four surfaces. See `release-readiness.md` / `PROOF.md`.

## Phase 3 — Event-level grain + derived rollups (planned; prompt: `PHASE3_CODEX_PROMPT.md`)
- **Own PR. Gated** — does not start until HHA-2 is shipped (now true). Add 7 synthetic event tables
  (migration `10014`, re-check vs origin/main); **preserve v1** seed logic before adding v2; derive
  the 5 gold rollups from events; flip provenance `seeded → derived`. Tolerance-based acceptance.
- Reconcile the demo by a **gated, approval-required wipe + re-seed of `ceeb9ea0`** with a real
  backup-table rollback artifact + scratch-env verify first.

## Phase 4 — Governed PHI-safe copilot (planned; prompt: `PHASE4_CODEX_PROMPT.md`)
- **Own PR; after Phase 3.** Meridian-style scope guardrail; pre-model medical-advice refusal
  (lab-*ops* analytics allowed, individual lab-*result* interpretation refused); **fixed-intent**
  `hha.aggregate_query` MCP tool (no free SQL, no identifier columns, suppression); audit via existing
  `ai_decision_audit_log` (no new tables); standalone copilot + governance pages. See [ai-behavior.md](ai-behavior.md).

Each phase gate requires: tests/receipts, updated `PROOF.md`/`release-readiness.md`, and updated
`next-session.md`. Phase 3 and Phase 4 are **separate execution PRs**. No phase starts without explicit approval.
