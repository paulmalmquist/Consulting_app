# Novendor CRM / Accounting — Backlog

**Last updated:** 2026-05-19

## Bugs
- [x] **Tasks board logger crash** — `backend/app/routes/consulting.py:2449` — `GET /api/consulting/execution/board` raised `emit_log() got an unexpected keyword argument 'exc_info'` when auto-generation failed, masking the real error and breaking the Generate button. **Fixed 2026-05-19** (parent commit `7f8332d8`): replaced positional + `exc_info=` call with keyword-only `emit_log(..., error=auto_exc)`. Regression test `backend/tests/test_execution_board_route.py`. See dispatch `0002`.
- [x] **`run_auto_generation` SQL bug: `column o.stage does not exist`** — `backend/app/services/execution_auto.py` — **Fixed + shipped 2026-05-19 (Ticket 2B).** `crm_opportunity` has no `stage` column; stage is the FK → `crm_pipeline_stage`. Proposal pass now joins `crm_pipeline_stage` and filters `lower(s.key)='proposal'`. PR #71 merged (`45833c00`), Railway deploy `d0df0115` SUCCESS. Production smoke: live board endpoint returns **HTTP 200** (was 500), no `UndefinedColumn` in logs. Static regression guard added (`backend/tests/test_execution_auto_stage_query.py`). See dispatch `0002` Ticket 2B.
- [ ] **Verify ECC brief renders real data** — `/lab/env/[envId]/ecc/brief` — Confirm whether this page shows real accounting data or a placeholder. Mark actual vs. placeholder.
- [ ] **Receipt ingestion status** — `backend/app/routes/nv_receipt_intake.py` — Verify receipts submitted via the intake endpoint appear in the accounting queue.

## Backend / API (deferred — do NOT pull into Ticket 3)
- [ ] **Normalize the consulting error envelope** — The global handler currently wraps `HTTPException` as `{"detail": {"error_code": "INTERNAL_ERROR", "message": "500: <detail>"}}`. Acceptable for fail-closed today. Later, normalize to a flatter stable shape the frontend can rely on: `{"error_code": "AUTO_TASK_GENERATION_UNAVAILABLE", "message": "Auto-task generation unavailable", "request_id": "..."}`. This is a frontend-contract change — own it in a deliberate API-cleanup ticket, not Ticket 3 and not the hierarchy work. Not urgent.

## UX improvements
- [ ] **ECC approval queue clarity** — `/lab/env/[envId]/ecc/approvals` — Confirm queue items have clear approve/reject actions and show relevant metadata (amount, vendor, date).
- [ ] **VIP contact list** — `/lab/env/[envId]/ecc/vips` — Verify this shows meaningful contact data, not an empty state.

## Backend / API
- [ ] **Apollo sync endpoint** — Verify whether a sync endpoint exists that pulls Apollo contacts into the Novendor CRM, or if this is manual/MCP-only.
- [ ] **Accounting snapshot writer** — `backend/app/services/accounting_snapshot_writer.py` — Determine what triggers snapshot writes and verify they work.

## Data / migrations
- [ ] **CRM table schema** — Needs repo verification. Identify tables in Supabase for contacts, deals, and accounts. Confirm env_id and RLS.
- [ ] **Accounting entries table** — Confirm the table name and schema for accounting entries/receipts.

## Tests
- [ ] **No known tests for accounting queue** — `backend/app/services/nv_accounting_queue.py` — Needs unit tests.
- [ ] **No known tests for receipt intake** — `backend/app/routes/nv_receipt_intake.py` — Needs integration tests.

## Documentation
- [ ] **Link design handoff** — `design_handoff_accounting_command_desk/` exists — reference it from architecture.md when content is verified.

## Nice-to-have
- [ ] Email-based receipt ingestion (forward to an address)
- [ ] Slack/Telegram notifications for approval queue items

## Daily Operator Control Plane (dispatch 0002 — hierarchy buildout, deferred)
Tracked in `docs/plans/03-implementation-plans/active/0002-novendor-daily-operator-control-plane.md`. Workstreams, in order:
- [x] **B / Ticket 3 — Hierarchy migration** — **DONE & VERIFIED 2026-05-19.** `repo-b/db/schema/10003_consulting_task_hierarchy.sql`, PR #73 merged (`4a800d8e`), applied + verified live (CI DB Schema Gate SUCCESS). 10 additive columns on `cro_execution_task` + 3 RLS reference tables + seeds (5 domains / FlowYorker+7 workstreams / 6 industry initiatives). Board still HTTP 200, 19 tests pass. See dispatch `0002` Workstream B / Ticket 3.
- [ ] **C — Tasks UI hierarchy** — domain grouping + initiative/workstream filter in `repo-b/src/components/consulting/execution/ExecutionBoard.tsx`, lanes preserved.
- [ ] **D — FlowYorker / Web Properties** — FlowYorker.com as first `web_properties` initiative + 7 workstreams.
- [ ] **E — Outreach/CRM linkage** — tasks ↔ `crm_account`/`crm_contact`/`crm_opportunity`/`crm_activity`.
- [ ] **F — Coding / impl-plan linkage** — `coding_platform` tasks ↔ active plans via `related_url`.
- [ ] **G — Morning Checklist** — read-time generated view over `cro_execution_task` (no new table).
- [ ] **H — Assistant/CoWork retrieval** — copilot answers over real board state, fail-closed.

## Completed
- [x] **Tasks board logger crash fixed + shipped to production** — 2026-05-19 — `consulting.py:2449`. PR #67 (fix) + PR #69 (pre-existing `DealOut` F811 unblock) merged to `main` (merge commit `cebc4e5a`). Backend deployed to Railway `authentic-sparkle` production (deployment `0f05e231`, SUCCESS). Production smoke: live board endpoint returns clean fail-closed 500, **zero `exc_info` in prod logs**, structured `emit_log` confirmed (request_id `req_8d4f073b638b3_1779201977414`). The fix surfaced the real `o.stage` SQL fault (now a Bugs item). Ticket 1 + 2 done; Ticket 3 unblocked. See dispatch `0002`.
