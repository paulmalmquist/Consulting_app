# Telemetry Research Gap Remediation Plan

**Created:** 2026-06-18
**Status:** ACTIVE — inspection pass complete; **Ticket 1 implemented + tested** on branch `feat/telemetry-security-posture` (commit 276b9182, not pushed). Tickets 2–12 queued. See §11 Session log.
**Environment:** RS Telemetry / Telemetry Platform (NASA aerospace analog) — env folder `docs/plans/telemetry-platform/`; demo env_id `dc82d39d-9be2-49b0-a01d-c7181b13a8b6`.
**Baseline:** committed **HEAD** of `feat/hr-ml-algorithm-decision-lab`. The working tree has 83 uncommitted deletions that are NOT part of this analysis (see §7 Working-tree hazard).

---

## 1. Purpose

Inspect the three research inputs and the RS analytics plans against the **actual code** of the
Winston RS Telemetry app, then close the gap between what the research says a credible
telemetry/Relativity-Space demo needs and what is actually implemented — without fabricating data,
weakening fail-closed behavior, or presenting simulated integration as real. The telemetry app is
already substantial (Dispatch 0003 Phases 0–6, the RS streaming slice, the streaming spine), so most
gaps are **enrichment and honesty**, not greenfield.

## 2. Research inputs

| Input | Themes it drives |
|---|---|
| `director_ai_research.md` | Operational decision loops (TRR, post-test anomaly, MFG triage, lineage, LRR/FRR, ECR, supplier, model-based anomaly, exec visibility); entity ontology; physics residuals + receipts; secure-RAG entitlement; typed MCP tools + registry + audit; agent write safety; governance |
| `Research Gap Analysis and Complementary Research.md` | PLM/ERP/MES topology (Teamcenter / Infor LN / Manufacturo, eBOM↔mBOM, MuleSoft/event-queue middleware); RLS-in-DB secure RAG vs app-layer filtering; Purdue/OT boundary + local inference; MCP primitives + JSON-Schema 2020-12 validation; agent-side simulation / blast-radius; board AI governance (NACD); multi-modal "Director" |
| `docs/plans/RS_DEMO_CAPABILITY_CHECKLIST.md` | Per-capability BUILD/ADAPT/EXISTS checklist (data eng, data platform, trusted metrics, ML/AI, grounded analyst, MCP/agentic, cost governance, leadership exhibits) |
| `docs/plans/RS_ANALYTICS_PLATFORM_PLAN.md` | Target GCP/BigQuery/Looker/Vertex architecture, 11 gold data products, ITAR scoping (Looker/Dataform/Vertex out-of-boundary), ADO ticket-to-PR loop, cost discipline |
| `TELEMETRY_TEMPLATE/03_RELATIVITY_INSTANTIATION.md` (+ 00/01/02, CROSSWALK) | Operating-model instantiation: Confluence/Jira contract, roles, DoD with RE/FRR flight gate, NCF→Relativity crosswalk |
| `docs/plans/telemetry-platform/*` (README, architecture, roadmap, ai-behavior, eval-plan, release-readiness, backlog, next-session) | Build receipts for the live platform (Phases 0–6) |

Note: the task referenced `docs/plans/02-environments/` — **that folder does not exist**; the real
convention is one folder per environment at `docs/plans/<env>/` (telemetry = `telemetry-platform/`).

## 3. Current implementation inventory

Statuses: EXISTS / PARTIAL / MISSING / NOT APPLICABLE / NEEDS PRODUCT DECISION.

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Telemetry frontend (13 routes, dark console) | EXISTS | `repo-b/src/app/lab/env/[envId]/telemetry/{,stream,replay,stargate,monitoring,runs,model-performance,calibration,registry,factory,factory-ml,copilot,governance}`; nav `repo-b/src/components/telemetry/telemetryNav.ts` | Calibration screen EXISTS at HEAD (deleted in working tree — see §7) |
| Backend API (22 endpoints) | EXISTS | `backend/app/routes/telemetry.py`, `backend/app/routes/telemetry_copilot.py` | Live + fail-closed null_reason |
| 21 `tel_*` tables, RLS on `env_id` | EXISTS | `repo-b/db/schema/10006,10009,10010,10011,10014,10015,10016*` | `env_id = current_setting('app.env_id', true)` policy on all |
| Serving / scoring + persisted receipts | EXISTS | `backend/app/services/telemetry_serving.py` (`score_window`, `_verdict_for`, `_conformal_budget`); `tel_predictions` | Frozen GO/REVIEW/NO_GO bands |
| Anomaly + RUL models, MLflow gates | EXISTS | `telemetry-platform/databricks/notebooks/train_anomaly.py`, `train_rul.py`, `10_promote_models.py` | Baseline beat PCA (honest gate recorded) |
| Factory NCR intelligence (UMAP/HDBSCAN + backlog forecast) | EXISTS | `backend/app/services/telemetry_factory.py`; `tel_ncr_*` | Real model output mirrored from Databricks |
| Streaming spine (bronze→silver→gold, watermarks, DQ, pipeline-status) | EXISTS | `backend/app/services/telemetry_stream_{etl,ingest}.py`; `tel_stream_*`, `tel_etl_watermarks`, `tel_dq_assertions`, `tel_pipeline_status` | Idempotent; fail-closed STALE handshake |
| Copilot (deterministic classify → allow-list tools → grounded answer → post-validate → fallback) | EXISTS | `backend/app/services/telemetry_copilot.py`, `telemetry_copilot_policy.py`; `tel_copilot_interactions`, `tel_copilot_prompt_versions` | Anti-fabrication two-pass validator |
| Draft-report + within-reviewer A/B disposition | EXISTS | `/copilot/draft-report`, `/disposition`, `/usefulness`; `tel_copilot_reports`, `tel_copilot_review_actions` | `review_status='requires_human_review'` (data flag) |
| Governance cockpit (rates, latency, evals, conformal budget, smoke) | EXISTS | `repo-b/src/components/telemetry/GovernanceDashboard.tsx`; `/copilot/{governance,evals}` | No security-posture panel yet |
| Fused state vectors (256-d pgvector) | EXISTS | `tel_fused_state_vectors`, `tel_feature_manifest`; `14_fused_state_vector.py` | Built but **not queried by the copilot** |
| Platform MCP infra (registry/audit/auth/rate-limit, ~45 typed tool families, JSON-schema) | EXISTS | `backend/app/mcp/{registry,server,audit,auth,rate_limit}.py`, `backend/app/mcp/schemas/*`, `backend/app/mcp/tools/*` (incl. `rag_tools.py`) | **Zero telemetry-specific tools** (grep `tel_`/telemetry in `backend/app/mcp` → 0 files) |
| Telemetry test suite (5 files) | EXISTS | `backend/tests/test_{copilot_telemetry,telemetry_serving,telemetry_registry,telemetry_factory,telemetry_stream_etl}.py` | **No cross-tenant RLS isolation test** |
| Cross-tenant permission-leak test | MISSING | — (not found after inspecting `backend/tests/`) | RLS present on 21 tables but isolation never asserted in CI |
| Security / RAG posture surface | MISSING | — (not found in `GovernanceDashboard.tsx` or copilot governance payload) | First-PR target |
| Document RAG / retrieval-layer ACL | NOT APPLICABLE | copilot grounds on fetched structured evidence; no document corpus | Any "secure RAG" claim is overclaiming |
| Canonical entity ontology (vehicle/engine/stage/part/assembly/supplier/lot-serial/work-order/test-stand/requirement/procedure/decision-record) | PARTIAL | has run/channel/model/prediction/anomaly/NCR only | No genealogy graph query |
| TRR packet assembly | MISSING | — (no config+open-NCR+procedure+channel-list assembly endpoint) | |
| LRR/FRR readiness rollup | PARTIAL | `factory-ml` readiness gauges per vehicle | No open-items/waiver/verification rollup |
| Engineering-change impact; supplier/material tracking | MISSING | — | Depend on entity ontology |
| PLM/ERP/MES connectors + eBOM↔mBOM + middleware | MISSING | — | Streaming spine shows batch-vs-live conceptually |
| Physics residual chart + receipt viewer (UI) | PARTIAL | stream charts show readings+redlines+anomaly bands | No expected-value overlay / receipt viewer |
| LSTM/sequence over residuals | PARTIAL | CNN-LSTM calibration challenger at HEAD; serving champion is deterministic MAD rule | *Needs repo verification of CNN-LSTM training code* |
| FFT / wavelet / vibroacoustic | MISSING | IMS vibration extraction deferred; `TempVibrationChart` only | |
| Agent-side simulation / safe write (dry-run, blast-radius, approval, rollback) | MISSING | copilot reads + drafts only; no write actions | `requires_human_review` is a flag, not an enforced gate |
| Purdue/OT boundary + local inference | MISSING | streaming is public ISS feed | Strategy/ADR exhibit candidate |
| Multi-modal "Director" (briefing packet / storyboard / animated replay) | PARTIAL | draft-report → markdown packet EXISTS; replay animated | No orchestrated investigation storyboard; video gen NOT APPLICABLE |
| Model inventory + risk tier; incident/audit history; autonomous-action policy | PARTIAL | inventory via `/registry`; recent interactions/refusals | No risk_tier column, no incident table, no policy surface |

## 4. Gap matrix

Severity: P0 must-fix for a credible telemetry/Relativity demo · P1 strong differentiator · P2 useful, not urgent · P3 strategy-only / later.

| Research-backed capability | Current state | Gap | Severity | Recommended action | Demo value | Risk |
|---|---|---|---|---|---|---|
| Honest RAG / security posture (5b, 9b) | MISSING surface; "secure RAG" framing overstates (no document RAG) | No posture panel; overclaim risk | **P0** | Posture panel (enforced vs not-enforced), honest copy | High (ITAR-aware reviewer) | Low |
| Cross-tenant permission-leak test (5c) | MISSING | RLS untested in CI on 21 tables | **P0** | Automated cross-tenant RLS isolation test | High (auditability) | Low |
| Overclaim reconciliation (checklist 6.1 MCP; "secure RAG") | Plans claim more than telemetry ships | Docs assert capability the telemetry app lacks | **P0** | Honesty pass on checklist + demo copy | High (credibility) | Low |
| Nav consistency guard (calibration tab) | EXISTS at HEAD; working tree deletes it | Dangling nav → 404 if deletions ship | **P0** | Guard: keep HEAD or remove nav entry with the screen | High | Low |
| Telemetry MCP tools + registry surface + denied-call (7b/7c) | Platform MCP yes; telemetry no | No typed telemetry MCP tools; no denied-call demo | P1 | Register read tools; tool-registry view + policy-denied demo | High | Med |
| Entity ontology + part/lot genealogy (1g, 3) | PARTIAL | No canonical dims; no containment query | P1 | Ontology v1 + lineage view (synthetic data) | High | Med (schema) |
| TRR packet assembly + approval gate (1f) | MISSING | No evidence-assembly packet | P1 | Assembly endpoint + UI, `requires_human_review`, never auto-clear | High | Med |
| Residual chart + receipt viewer (4a/4d) | PARTIAL | No expected-value overlay / receipt UI | P1 | Residual+receipt panel over existing data | High | Low |
| Agent safe-write demo (7d, 8) | MISSING | No dry-run/blast-radius/enforced gate | P1 | Simulated write (draft investigation ticket) with blast-radius + approval | High | Med |
| LRR/FRR readiness rollup (1e) | PARTIAL | No open-items/waiver/verification rollup | P2 | Readiness rollup on entity model | Med | Med |
| Governance hardening (9c/9d) | PARTIAL | No risk_tier / incident table / policy surface | P2 | Model risk tier + incident history + autonomous-action policy | Med | Low |
| PLM/ERP/MES exhibit (2) | MISSING | No connectors / eBOM↔mBOM / boundary page | P2 / NEEDS PRODUCT DECISION | Synthetic, clearly-labeled connector exhibit + batch-vs-live page | Med | Med |
| ECR impact; supplier tracking (1h/1i) | MISSING | Depend on ontology | P2 | Defer until entity ontology lands | Med | Med |
| LSTM-in-serving; FFT/vibroacoustic (4c/4e) | PARTIAL / MISSING | CNN-LSTM not in lean serving; no spectral features | P3 | Document training-vs-serving split; spectral placeholder only | Low–Med | Med |
| Purdue/OT boundary + local inference (6) | MISSING | Demo is cloud-only | P3 / NEEDS PRODUCT DECISION | ADR + strategy exhibit page, no real OT | Low–Med | Low |
| Director investigation storyboard (10) | PARTIAL | No orchestrated storyboard | P3 | Only if it clarifies existing evidence; no video gen | Low | Low |

## 5. Proposed implementation sequence

> Each ticket is PR-sized. Schema items are **proposed only** here; no migration is written in this plan.

### Ticket 1 — Security & Access Posture panel + cross-tenant RLS permission-leak test  ⟵ FIRST PR — DONE (branch `feat/telemetry-security-posture`, commit 276b9182; see §11)
- **Scope:** (a) Backend: extend `telemetry_copilot.governance_summary()` (or add `security_posture()`) returning an honest, evidence-derived posture — **enforced** (DB RLS on N `tel_` tables, app-layer `business_id` scoping via `resolve_tenant_id`, copilot allow-list size, post-validator active, refusal-rule count, admin-key gate on `/stream/source`) and **explicit non-controls** (no retrieval-layer RAG ACL — structured-evidence grounding only; no OT/local inference; telemetry not wired to `mcp/audit.py`). Derived from real config/tables, never hardcoded. (b) Frontend: "Security & Access Posture" section in `GovernanceDashboard.tsx`, enforced vs not-enforced, each line citing evidence; dark-console; fail-closed "—" when unavailable. (c) Tests below.
- **Source areas:** `backend/app/services/telemetry_copilot.py`, `backend/app/routes/telemetry_copilot.py`, `repo-b/src/components/telemetry/GovernanceDashboard.tsx`, `repo-b/src/lib/telemetry/copilot-api.ts`, `backend/tests/`.
- **Data/schema impact:** NONE (read-only over existing tables; no migration).
- **AI/runtime impact:** governance read only; answer path unchanged; posture must not claim absent capabilities.
- **Security impact:** first automated cross-tenant isolation test; strengthens auditability.
- **Acceptance:** posture panel renders from live data (enforced + not-enforced both shown); RLS isolation test passes (tenant B sees 0 of tenant A's rows); permission-leak eval passes; panel explicitly states "no retrieval-layer RAG ACL — structured-evidence grounding only".
- **Tests/evals:** NEW `backend/tests/test_telemetry_rls_isolation.py` — set `app.env_id`/`SET ROLE` to tenant A, insert/select; switch to tenant B; assert 0 cross-tenant rows on `tel_predictions`, `tel_copilot_interactions`, `tel_copilot_reports`, `tel_fused_state_vectors`. ADD to `test_copilot_telemetry.py` a fail-closed case: a cross-tenant question returns null_reason, never another tenant's rows; assert posture reports the honest gaps.
- **Demo verification:** open `/telemetry/governance`, screenshot the posture panel; show the enforced/not-enforced split + the passing isolation test.
- **Risks/unknowns:** test must set the `app.env_id` GUC (Phase 3 did this manually — confirm the pytest DB fixture supports `SET app.env_id`/`SET ROLE authenticated`). If serving filters by `business_id` as defense-in-depth, assert **both** layers.

### Ticket 2 — Honesty pass: overclaim reconciliation + nav consistency guard (P0)
- **Scope:** Reconcile `RS_DEMO_CAPABILITY_CHECKLIST.md` 6.1 (MCP registry → PARTIAL: platform yes, telemetry no); replace "secure RAG" language for telemetry with "grounded structured-evidence Q&A; no document RAG"; resolve the dangling `calibration` nav entry against the working-tree decision.
- **Source areas:** `docs/plans/RS_DEMO_CAPABILITY_CHECKLIST.md`, demo copy, `repo-b/src/components/telemetry/telemetryNav.ts` (≤1 line).
- **Data/schema impact:** none. **AI/runtime impact:** none. **Security impact:** none (anti-overclaim).
- **Acceptance:** checklist + demo copy match shipped reality; no nav entry resolves to a 404.
- **Tests/evals:** route smoke (every nav slug resolves to a page); doc review.
- **Demo verification:** click every telemetry nav tab; none 404s.
- **Risks:** depends on the working-tree decision (Open question 1).

### Ticket 3 — Telemetry MCP tools + registry surface + denied-call demo (P1)
- **Scope:** Register the copilot's allow-listed **read** tools as typed MCP tools (JSON-Schema 2020-12, scoped, audited via `mcp/audit.py`); add a visible tool-registry view (extend `/telemetry/registry` or governance) demonstrating a **denied tool call with policy reason**. Read-only tools only.
- **Source areas:** `backend/app/mcp/schemas/telemetry_tools.py` (new), `backend/app/mcp/tools/telemetry_tools.py` (new), `backend/app/services/telemetry_copilot.py` (route tools through the registry), frontend registry/governance.
- **Data/schema impact:** none (tools are read-only). **AI/runtime impact:** copilot tool calls flow through MCP validation + audit. **Security impact:** centralizes telemetry tool audit.
- **Acceptance:** tools validate input against JSON Schema; an out-of-policy call is denied with a stated reason; audit receipt persisted.
- **Tests/evals:** schema-validation test (bad payload rejected); denied-call test (policy reason returned); audit-receipt assertion.
- **Demo verification:** trigger a denied tool call in the UI; show the policy reason + audit row.
- **Risks:** keep read/write separation strict; no write tools in this ticket.

### Ticket 4 — Entity ontology v1 + part/lot genealogy (P1)
- **Scope:** Canonical entities (vehicle, engine, stage, part, assembly, supplier, lot/serial, work-order, test-stand) as `tel_` dimension tables (RLS, `env_id`+`business_id`, COMMENT) seeded with **synthetic** RS data; a containment graph query ("where is this lot installed and what's open against it?"); a lineage view.
- **Source areas:** `repo-b/db/schema/NNN_telemetry_ontology.sql` (proposed), `backend/app/services/telemetry_ontology.py` (new), frontend lineage view.
- **Data/schema impact:** **PROPOSED migration** (new `tel_` dims, full RLS) — not written this pass; resolve number live; register prefixes per `ARCHITECTURE.md`.
- **AI/runtime impact:** enables ontology-grounded answers later. **Security impact:** RLS + tenant policy mandatory on every new table.
- **Acceptance:** containment query returns correct installed-location set for a seeded lot; lineage view renders; RLS verified.
- **Tests/evals:** containment-query correctness test; cross-tenant RLS test on new tables (extend Ticket 1's harness).
- **Demo verification:** trace a synthetic suspect lot to its installed assemblies/vehicles.
- **Risks:** schema review required; keep synthetic data clearly labeled.

### Ticket 5 — TRR packet assembly with approval gate (P1)
- **Scope:** Evidence-assembly endpoint + UI pulling current config + open NCRs + procedure version + channel list with citations, marked `requires_human_review`; never auto-clears a constraint. Reuses the draft-report receipt pattern.
- **Source areas:** `backend/app/services/telemetry_copilot.py` (assembly), `backend/app/routes/telemetry_copilot.py`, frontend.
- **Data/schema impact:** reuse `tel_copilot_reports` or a sibling table (proposed). **AI/runtime impact:** assembly only, no auto-decision. **Security impact:** enforced human gate.
- **Acceptance:** packet assembled only from real evidence with citations; missing inputs fail closed with null_reason; gate cannot be bypassed.
- **Tests/evals:** fail-closed on missing NCR/procedure; "never auto-clear" assertion.
- **Demo verification:** assemble a TRR packet for a seeded run; show the citations + human gate.
- **Risks:** scope creep into LRR/FRR — keep to TRR.

### Ticket 6 — Model-vs-measured residual chart + prediction-receipt viewer (P1)
- **Scope:** Expected-value overlay + residual chart on Mission Control/Replay; a receipt viewer rendering a persisted `tel_predictions` row (model version, window, score, threshold, attribution, null_reason). No new model; reads existing data.
- **Source areas:** `repo-b/src/components/telemetry/{MissionControlStream,ReplayConsole}.tsx`, `repo-b/src/lib/telemetry/api.ts`.
- **Data/schema impact:** none. **AI/runtime impact:** none. **Security impact:** none.
- **Acceptance:** residual chart shows expected vs measured + threshold; receipt viewer renders a real receipt; honest "—" when absent.
- **Tests/evals:** component render test from a fixture receipt; visual check.
- **Demo verification:** open a NO_GO run; show residual + the receipt that drove the verdict.
- **Risks:** label "expected" honestly (statistical baseline, not physics sim).

### Ticket 7 — Agent safe-write demo (P1)
- **Scope:** A simulated write ("draft investigation ticket" / "propose schedule change") with dry-run, predicted blast-radius summary, policy check, **enforced** approval gate, audit receipt, no-op on failed validation. No destructive write.
- **Source areas:** `backend/app/services/telemetry_copilot.py` or new `telemetry_actions.py`, frontend.
- **Data/schema impact:** action-audit table (proposed). **AI/runtime impact:** introduces the first write path — must stay simulated. **Security impact:** blast-radius + approval before any effect.
- **Acceptance:** dry-run shows predicted effect + blast-radius; approval required; failed validation → no-op + reason; audit receipt persisted.
- **Tests/evals:** approval-gate enforcement; no-op on policy violation; audit receipt assertion.
- **Demo verification:** run a dry-run, show blast-radius, require approval, confirm no destructive change.
- **Risks:** must never perform a real enterprise write.

### Ticket 8 — LRR/FRR readiness rollup (P2)
Sourced, drillable open-items / verification-coverage / waiver-status rollup on the entity model (depends on Ticket 4). Acceptance: every rolled-up number drills to source; fail-closed on missing inputs. Tests: rollup correctness + drill-through.

### Ticket 9 — Governance cockpit hardening (P2)
Model risk-tier classification, incident/audit-history table, autonomous-action policy surface, board oversight checklist. Schema: proposed risk_tier column + incident table. Tests: risk-tier surfacing + incident-history fail-closed.

### Ticket 10 — PLM/ERP/MES synthetic connector + batch-vs-live boundary exhibit (P2, NEEDS PRODUCT DECISION)
Mocked Teamcenter / Infor LN / Manufacturo connectors + eBOM↔mBOM reconciliation, explicitly labeled "simulated"; a batch-vs-live boundary page (streaming spine already demonstrates the live lane). Acceptance: every simulated element is labeled; no claim of real integration.

### Ticket 11 — Purdue/OT boundary ADR exhibit (P3)
ADR + strategy page on cloud-vs-OT isolation and local inference; no real OT integration.

### Ticket 12 — Director AI investigation storyboard (P3)
Orchestrated post-test investigation timeline/storyboard from live evidence — only if it clarifies existing evidence. No gimmicky video generation.

## 6. Recommended first PR

**Ticket 1 — Security & Access Posture panel + cross-tenant RLS permission-leak test.** It proves the
inspection mattered (anti-overclaim + the missing permission-leak eval the acceptance criteria
require), is visible on the governance page, needs no migration or deploy, strengthens the ITAR-aware
Relativity story, and verifies cleanly via a new automated cross-tenant isolation test.

## 7. Explicit non-goals

- No real Teamcenter / Infor LN / Manufacturo credentials or live PLM/ERP/MES integration.
- No video generation for the "Director" theme.
- No FFT/vibroacoustic full implementation (placeholder only if/when needed).
- No weakening of fail-closed / null_reason / audit logging anywhere.
- **No restoring or committing the 83 working-tree deletions as part of gap remediation.** The working
  tree deletes the RUL Calibration screen (`page.tsx`, `RulCalibration.tsx`, `RulCalibration.test.tsx`,
  `calibrationEvidence.ts`), the calibration Databricks notebooks, and the ADE / audit-dashboard /
  workflow-registry / telemetry-trust+calibration plans, while `telemetryNav.ts:25` still advertises
  "RUL Calibration". Committing/deploying the tree as-is would 404 the calibration tab and delete
  shipped capability. Reconcile this as a **separate, deliberate decision** (remove the nav entry
  **iff** removing the screen is intended) — it is a regression-guard, not a research gap.

## 8. Open questions

1. Working-tree deletions — intentional cleanup to commit separately, or revert? (Drives Ticket 2 nav reconcile.)
2. PLM/ERP/MES (Ticket 10) — synthetic exhibit only, or a deeper mocked connector layer?
3. Entity ontology (Ticket 4) — `tel_`-prefixed dimension tables, or a separate graph store?
4. Purdue/OT story (Ticket 11) — wanted as an exhibit at all, given the demo runs cloud-only?
5. CNN-LSTM challenger (4c) — confirm whether training code exists at HEAD and whether it should ever enter lean serving.

## 9. Session evidence

**Files / dirs inspected (read):** `director_ai_research.md`; `Research Gap Analysis and Complementary Research.md`;
`docs/plans/{RS_DEMO_CAPABILITY_CHECKLIST,RS_ANALYTICS_PLATFORM_PLAN,PLAN_MAINTENANCE_RULES}.md`;
`docs/plans/00-dispatch/routing-map.md`; `TELEMETRY_TEMPLATE/03_RELATIVITY_INSTANTIATION.md` (+ siblings);
`docs/plans/telemetry-platform/*`; `docs/plans/03-implementation-plans/active/{0003-telemetry-platform-build,rs-telemetry-demo-hardening}.md`;
`repo-b/src/app/lab/env/[envId]/telemetry/**`, `repo-b/src/components/telemetry/**`, `repo-b/src/lib/telemetry/**`,
`repo-b/src/components/telemetry/telemetryNav.ts`, `repo-b/src/app/api/telemetry/[...path]/route.ts`;
`backend/app/routes/telemetry*.py`, `backend/app/services/telemetry_*.py`, `backend/app/mcp/**`;
`repo-b/db/schema/10006,10009,10010,10011,10014,10015,10016*`; `backend/tests/test_telemetry_*.py`, `test_copilot_telemetry.py`;
`telemetry-platform/databricks/**`.

**Commands run:**
- `git log --stat c38f2df8` → confirmed the RUL Calibration screen (page + `RulCalibration.tsx` + test + `calibrationEvidence.ts`) was added at that commit.
- `git ls-files` + `git cat-file -e HEAD:<path>` → calibration files **tracked and present at HEAD**.
- `git status --porcelain` → **83 deletions** in the working tree (calibration screen/notebooks, ADE/audit-dashboard/workflow-registry routes & services, telemetry-trust/calibration plans + evidence).
- Grep `tel_`/telemetry in `backend/app/mcp` → **0 files** (no telemetry-specific MCP tools).

**Key findings:** the telemetry app is far more built-out than the research "gaps" imply; the load-bearing
real gaps are (1) honest security/RAG posture + a tested cross-tenant RLS boundary, (2) telemetry MCP
tools/registry surface, (3) entity ontology + genealogy, then evidence-assembly (TRR), residual/receipt
UI, and agent safe-write. "Secure RAG" and "MCP tool registry (telemetry)" are current overclaims.

## 10. tips.md updates

Added to `docs/tips.md` (canonical; not root `./tips.md`):
- Telemetry routes live at `repo-b/src/app/lab/env/[envId]/telemetry/*`; nav single-source is `repo-b/src/components/telemetry/telemetryNav.ts` — add/remove a screen by editing the nav array or you get a dangling/404 tab.
- 21 `tel_*` tables are RLS-enabled on `env_id`, but isolation was untested in CI — RLS presence ≠ tested isolation.
- The telemetry copilot does **not** do document RAG; it grounds on fetched structured evidence with a two-pass anti-fabrication post-validator. `tel_fused_state_vectors` (pgvector) exists but the copilot never queries it.
- Platform MCP (`backend/app/mcp/`) is robust but has **zero** telemetry-specific tools; the copilot uses an inline `ALLOW_LIST`, separate from the MCP registry/audit.
- `docs/plans/02-environments/` does not exist; per-env folders live at `docs/plans/<env>/` (telemetry = `docs/plans/telemetry-platform/`).

## 11. Session log — Ticket 1 (2026-06-18)

**Shipped (branch `feat/telemetry-security-posture`, commit 276b9182, NOT pushed):**
- `backend/app/services/telemetry_copilot.py` — new `security_posture()` reads real `tel_*` RLS coverage from `pg_catalog` (excludes partition children) and returns enforced controls + honest non-controls.
- `backend/app/routes/telemetry_copilot.py` — `/copilot/governance` now folds in `security_posture`.
- `repo-b/src/lib/telemetry/copilot-api.ts` — `SecurityPosture`/`PostureControl` types + optional `security_posture` field.
- `repo-b/src/components/telemetry/GovernanceDashboard.tsx` — "Security & access posture" panel (enforced vs not-enforced/N-A), fail-closed to "Not available".
- `backend/tests/test_telemetry_rls_isolation.py` (new) + `repo-b/src/components/telemetry/GovernanceDashboard.test.tsx` (new).

**Verification:** backend `pytest` 55 passed / 1 skipped (the opt-in live-DB RLS proof); `repo-b` typecheck clean; vitest telemetry 42 passed. No schema migration, no deploy.

**Material finding (reshaped the panel, in our favor):** the FastAPI runtime pool (`backend/app/db.py:get_cursor`) connects with a privileged role and never `SET ROLE`/`app.env_id` per request — so **RLS on the 21 `tel_*` tables is defense-in-depth (protects direct Supabase/PostgREST clients); the runtime tenant boundary is app-layer `business_id` scoping via `resolve_tenant_id`.** The posture panel states this plainly rather than claiming "RLS enforces tenant isolation at runtime."

**RLS-test decision (resolved a flagged blocker):** the standard suite mocks the DB (`fake_cursor`), the `db_conn` integration fixture auto-skips without a real Postgres, and there is no non-owner real-DB harness. So the deterministic, CI-runnable proofs are (a) a static-SQL invariant over the telemetry schema files (every logical `tel_*` table declares RLS + a `current_setting('app.env_id', true)` tenant policy + `WITH CHECK`) and (b) app-layer cross-tenant scoping via `fake_cursor` (reads bind only the caller's `business_id`). A real-engine behavioral proof exists but is **opt-in (`TELEMETRY_RLS_LIVE_TEST=1`) and read-only**, so it can never touch production and skips in CI.

**Environment note:** the local venv is Python 3.14.4; the pinned `scikit-learn==1.6.1` has no cp314 wheel and its source build fails, which blocks `app.main` import (the new `hr_ml_demo` trainers need sklearn). Installed `scikit-learn==1.9.0` (cp314 wheel, `--only-binary=:all:`) into the shared venv to run the real suite — a version drift from the pin, not a code change. Consider bumping the `backend/requirements.txt` pin (or adding a cp314-compatible constraint) so CI/local on 3.14 works without manual intervention.

**Isolation:** all work done in a `git worktree` at HEAD (`C:/Projects/Consulting_app-ticket1`, branch off committed HEAD) with `node_modules`/`.venv` junctioned from the main checkout — guaranteeing the commit contains only the 6 Ticket 1 files and none of the 83 working-tree deletions.

**Next:** push + open PR when ready; then Ticket 2 (honesty pass: checklist 6.1 MCP → PARTIAL, drop "secure RAG" wording, reconcile the calibration nav vs the working-tree deletion).
