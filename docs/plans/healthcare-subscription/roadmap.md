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

## Phase 2 — Funnel + Cohorts + Operations (in review; not shipped or deployed)
- Read APIs and standalone pages for Funnel, Cohorts, and Operations are implemented on
  `codex/hha-phase-2-surfaces`.
- Cohort suppression is enforced before response serialization. The masked pilot payload
  contains only cohort month, channel, marker, and reason.
- Shared primitives and four-surface navigation keep Overview visually unchanged apart from
  the added navigation.
- Channel LTV:CAC remains open because channel-specific LTV is not present at the seeded grain.
- Exit gate: draft PR review and acceptance. No merge or deployment is part of HHA-2 delivery.

## Phase 3 — Event-level grain + derived rollups (not started)
- Add `hha_members`, `hha_subscriptions`, `hha_lab_orders`, `hha_consults`,
  `hha_fulfillment_events`, `hha_support_tickets`, `hha_billing_events` (synthetic).
- Make the gold rollups derived from events (retention emerges from the data); flip the
  provenance label from "seeded" to "derived".

## Phase 4 — Governed PHI-safe copilot (not started)
- Scope-label guardrail in `prompt_registry.py` (mirror the Meridian precedent).
- Schema-only allow-listed tools over `hha_*` rollups; aggregate + read-only; small-cell
  suppression (<11); medical-advice refusal; audit receipts via `governance.record_decision`.
- See [ai-behavior.md](ai-behavior.md) and [eval plan in backlog].

Each phase gate requires: tests/receipts, an updated `PROOF.md`, and an updated
`next-session.md`. No phase starts without explicit approval.
