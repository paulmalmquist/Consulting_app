# Dispatch Record 0002 — Novendor Daily Operator Control Plane

**Created:** 2026-05-19
**Status:** Active — Ticket 1 done, Workstreams B–H open
**Environment:** Novendor CRM / Accounting
**Deliverable type:** Multi-ticket roadmap (bug fix done + additive hierarchy buildout deferred)

---

## Context

`/lab/env/[envId]/consulting/tasks` is a flat Kanban (Today / This Week / Waiting / Done) backed by
`cro_execution_task` (schema `525_execution_board.sql` + `604_cro_execution_task_re_engage.sql`),
served by `GET /api/consulting/execution/board` → `backend/app/routes/consulting.py:2433`
→ `backend/app/services/execution_tasks.py`.

Two problems:

1. **Live bug (FIXED 2026-05-19).** The board route threw `emit_log() got an unexpected keyword
   argument 'exc_info'` at `backend/app/routes/consulting.py:2449`. `emit_log`
   (`backend/app/observability/logger.py:76`) is keyword-only
   (`def emit_log(*, level, service, action, message, context=None, request=None, duration_ms=None, error=None)`).
   The call passed positional args + `exc_info=`, so when auto-generation raised, the error
   handler itself raised a `TypeError`, masking the real failure and breaking the Generate button.
2. **Flat model.** FlowYorker.com, outreach/BD, Winston coding, Novendor industry positioning, and
   admin/accounting are all run out of this one page. A flat board can't roll those up.

Intended outcome: a stable board (done), then a hierarchical operating surface
(Operating Domain → Initiative → Workstream → Task) built **additively** on `cro_execution_task`.

---

## Dispatch routing

- **Environment:** Novendor CRM / Accounting (`docs/plans/novendor-crm-accounting/`)
- **Shared standards touched:**
  - `01-shared-standards/design-system/shell-navigation-rules.md` (dark operator shell, ≤7 nav items — Workstream C)
  - `01-shared-standards/design-system/component-contracts.md` (card/lane grouping — Workstream C)
  - `01-shared-standards/ai-runtime/fail-closed-rules.md` (Generate fail-closed, assistant retrieval — A, H)
  - `01-shared-standards/evals/regression-suite.md` (nav + lane regression guard)
- **Frontend:** `repo-b/src/app/lab/env/[envId]/consulting/tasks/page.tsx`, `repo-b/src/components/consulting/execution/ExecutionBoard.tsx`, `repo-b/src/lib/cro-api.ts`
- **Backend:** `backend/app/routes/consulting.py`, `backend/app/services/execution_tasks.py`, `backend/app/services/execution_auto.py`, `backend/app/observability/logger.py`
- **DB/schema:** additive only — new migration `repo-b/db/schema/10003_consulting_task_hierarchy.sql` (Workstream B; **not** Ticket 1)
- **AI/runtime:** Novendor copilot retrieval over the board (Workstream H, later)
- **Evals:** `backend/tests/test_execution_board_route.py` (added), Playwright smoke for `/consulting/tasks`, dark-mode visual check
- **Risk level:** **Ticket 1 = Low** (single-line logging fix, no schema/UI change). Workstreams B–H = Medium (additive schema + UI), deferred.

Next schema number confirmed: **`10003`**, convention `NNNNN_module_description.sql`
(last files: `10000_crm_next_action`, `10001_crm_opportunity_lifecycle`, `10002_history_rhymes_research_planning`).

---

## Product intent

Convert the Tasks page into the daily operating surface for Novendor, FlowYorker, outreach,
coding, and admin — without a second task architecture and without breaking the existing board.

## Task hierarchy

`Operating Domain → Initiative → Workstream → Task` (checklist items via optional `parent_task_id`).

**Decision (user, 2026-05-19): controlled hybrid model. Phase 1 domains are system-controlled keys,
not user-created free text.**

| domain_key | label |
|---|---|
| `web_properties` | Web Properties |
| `outreach_crm` | Outreach / CRM |
| `coding_platform` | Coding / Winston Platform |
| `novendor_web` | Novendor Web / Industry Sections |
| `admin_ops` | Admin / Accounting / Operations |

- **FlowYorker.com is an Initiative under `web_properties`**, not a top-level domain (so a second
  site/business stays clean). Workstreams: Site Operations, Content / SEO, Design / UX,
  Publishing / Deployment, Monetization / Partnerships, Analytics / Performance, Backlog / Ideas.
- **`novendor_web`** seed initiatives: Real Estate, Private Equity, Medical, Legal,
  Construction / PDS, AI Operating System / Governance.
- **`coding_platform`** tasks map to active implementation plans / tickets where possible
  (`related_entity_type='impl_plan'`, `related_url` → plan path).
- **Morning Checklist is initially generated at read time from `cro_execution_task`**
  (priority/`impact` + `due_date` + `status` + `domain_key` + `next_action`). Do not persist
  checklist rows unless a later ticket explicitly adds audit/review history.

## Domain model — map onto existing `cro_execution_task`, do not duplicate

`cro_execution_task` already has: `status` (today/this_week/waiting/done), `type`
(outreach/product/proof_asset/research/follow_up), `impact` (1–5), `revenue_tag`, `due_date`,
`next_action`, `why_now`, `linked_deal_id`, `linked_contact_id`, `auto_source`, `re_engage_at`,
`blocked_reason`, `completed_at`, env-scoped + RLS (`env_id = current_setting('app.env_id', true)`).

**Reuse these.** Do NOT add new status/type/priority/date columns. Migration `10003` adds only:

| New column (nullable) | Purpose |
|---|---|
| `domain_key text` | one of the 5 controlled keys; NULL = ungrouped (honest empty state) |
| `initiative_key text` | e.g. `flowyorker`, `re`, `pe` |
| `workstream_key text` | e.g. `site_ops`, `content_seo` |
| `parent_task_id uuid` | self-FK, `ON DELETE SET NULL` — subtasks / checklist items |
| `source_kind text` | manual / generated / crm / coding_plan / accounting / website (distinct from existing `auto_source`) |
| `related_entity_type text` | e.g. `impl_plan`, `crm_account`, `receipt`, `web_property` |
| `related_entity_id uuid` | |
| `related_url text` | plan path, site URL, ticket link |
| `evidence jsonb` | receipts/screenshots/links |
| `last_reviewed_at timestamptz` | for industry-section "last reviewed" tracking |

Plus a small `cro_operating_domain` reference table (env-scoped, RLS, seed the 5 keys + labels +
`sort_order`) and `cro_initiative` / `cro_workstream` reference tables keyed by
`(env_id, domain_key, key)`. Tasks store these keys directly and UI/API should resolve labels
from reference tables when available; missing reference rows degrade to honest empty states
("No linked initiative") rather than erroring. **All `10003` changes additive; existing rows get
NULL hierarchy and continue to render in current lanes.**

---

## Workstream A — Current bug fix (Ticket 1) — DONE 2026-05-19

`backend/app/routes/consulting.py:2448-2456` now calls:

```python
emit_log(
    level="error",
    service="backend",
    action="execution.auto_generation_failed",
    message="Auto-task generation failed",
    context={"env_id": env_id, "business_id": str(business_id)},
    error=auto_exc,
)
```

Mirrors the verified keyword-only pattern in `backend/app/assistant_runtime/contract_enforcer.py`.
`emit_log` auto-enriches `request_id`/`env_id`/`business_id`; `build_error()` captures the
traceback into the logged `error.stack` (logs only — never returned to the client). The existing
`raise HTTPException(status_code=500, detail="Auto-task generation unavailable")` fails closed;
the global handler wraps it as
`{"detail": {"error_code": "INTERNAL_ERROR", "message": "500: Auto-task generation unavailable"}}`.

No additional product behavior change was needed for Ticket 1. Any underlying auto-generation
fault remains visible as a clean fail-closed error and is tracked separately (see backlog) — the
fix surfaces such faults instead of masking them with a `TypeError`.

> Scope note: `exc_info=` appears 7× elsewhere (`contract_enforcer.py`, `resume_tools.py`,
> `langfuse_client.py`, `pending_action_manager.py`) but those are on the **stdlib `logger`**,
> which legitimately accepts `exc_info=True`. `consulting.py:2449` was the only `emit_log`
> misuse. The others were not touched.

Regression test: `backend/tests/test_execution_board_route.py` — two tests monkeypatch
`run_auto_generation` to raise and assert a clean fail-closed 500 with no `TypeError`/`exc_info`
in the body. **Both pass.** 15 related consulting/execution tests still pass.

---

## Ticket 2 — Production deployment verification — DONE & VERIFIED 2026-05-19

**Why:** the live site still showed the `exc_info` banner after Ticket 1 was committed —
because the commit was on a branch, not merged/deployed. Production deploys from `main`.

**Delivery path executed (user-directed):**
1. Found 2 pre-existing red CI checks on `main`, neither caused by Ticket 1:
   - Backend Lint — duplicate `DealOut` import in `consulting.py` (already on `main`).
   - Repo Guardrails — `1000` duplicate schema prefix from `10000_/10001_` (baseline `main` debt).
2. Separate lint-fix PR **#69** (`chore: remove duplicate DealOut import (F811)`) — merged to
   `main` (squash). `consulting.py` is now ruff-clean.
3. Rebased PR **#67** on updated `main` (clean, no conflicts; fix + tests intact, re-verified).
4. Merged **#67** to `main` — merge commit `cebc4e5a607b2aea3388dcaac3921c74c1245926`,
   merged 2026-05-19T14:42:04Z. (`main` is unprotected; repo-wide Backend Lint / Repo
   Guardrails remain red for unrelated pre-existing reasons — accepted, backlogged, not chased.)
5. Deployed backend from merged `main` to Railway: project/service **`authentic-sparkle`**,
   environment **production**, deployment `0f05e231-1adb-46c9-9075-ecbfceb272d7` → **SUCCESS**
   (previous prod deployment was `02570297…` from 2026-05-18, pre-fix).

**Production smoke — PASSED (decisive evidence):**
- `GET https://novendor.ai/bos/api/consulting/execution/board?env_id=62cfd59c-…` now returns
  the clean fail-closed body `{"detail":{"error_code":"INTERNAL_ERROR","message":"500:
  Auto-task generation unavailable"}}` — **no `exc_info` TypeError**.
- Railway logs show the structured line `action="execution.auto_generation_failed"` with
  `request_id="req_8d4f073b638b3_1779201977414"`, structured `error={name,message,stack}`,
  `context={env_id,business_id}` — exactly the keyword-only `emit_log(..., error=auto_exc)`
  behavior. **`grep -c exc_info` over recent prod logs = 0.**
- The `exc_info` masking bug is resolved in production.

**Real underlying fault now surfaced (was masked before — separate from the logger bug):**
The fix exposed the genuine `run_auto_generation` defect it was designed to stop hiding:

```
psycopg.errors.UndefinedColumn: column o.stage does not exist
LINE 16:  AND lower(o.stage) = 'proposal'
  backend/app/services/execution_auto.py:338, in run_auto_generation
```

This is now a clean fail-closed 500 (correct behavior), tracked as Ticket 2B.

---

## Ticket 2B — Fix consulting auto-gen `o.stage` SQL reference — DONE & VERIFIED 2026-05-19

**Schema finding (evidence-based, verified local + live, not guessed):**
`crm_opportunity` has **no `stage` column**. Stage is the FK
`crm_opportunity.crm_pipeline_stage_id → crm_pipeline_stage` (canonical schema
`repo-b/db/schema/260_crm_native.sql`). `crm_pipeline_stage` has `key` + `label`.
Live Supabase (`ozboonlsplroialdwuxj`) confirmed: `crm_opportunity` exposes
`crm_pipeline_stage_id` + `status` only; `crm_pipeline_stage` has a row
`key='proposal'`, `label='Proposal'`. The proposal stage is
`crm_pipeline_stage.key = 'proposal'` (stable machine key, not display label).

**Fix (`backend/app/services/execution_auto.py`, pass 8 / proposal follow-up):**
replaced `AND lower(o.stage) = 'proposal'` with a join
`JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id`
and filter `lower(s.key) = 'proposal'`. Inner join is deliberate and correct —
an opportunity with no stage cannot be in proposal; this matches the original
filter's intent and preserves fail-closed zero-result behavior. Stale comment
("Stage values come from crm_opportunity.stage") corrected. Localized to
`execution_auto.py` + one new test; no migration, no UI, no hierarchy change.

**Tests:** new `backend/tests/test_execution_auto_stage_query.py` (static guard:
no `o.stage` reference may return; proposal pass must join `crm_pipeline_stage`
and filter `lower(s.key)='proposal'`). Full set: 19 passed
(new guard + `test_execution_board_route` + `test_executions` +
`test_consulting_pipeline` + `test_pipeline_execution_engine`). ruff + AST clean.
Fixed query run against live Supabase: `proposal_open_deals: 1`, no UndefinedColumn.

**Ship:** PR **#71** merged to `main` (merge commit
`45833c0060a511cbc6ae8c8aaa09d5c31f1700ad`). Backend deployed to Railway
`authentic-sparkle` production, deployment
`d0df0115-17b5-41a5-97a0-35a6e45a507d` → SUCCESS.

**Production smoke — PASSED:** live
`GET /bos/api/consulting/execution/board?env_id=62cfd59c-…` now returns
**HTTP 200** with `{"tasks":[],"summary":{…},"auto_report":{…}}`. Railway logs:
`status_code=200`, `200 OK`, no `UndefinedColumn` / `o.stage` /
`auto_generation_failed`. `auto_report.pipeline_proposal_sent_no_followup=0`
(proposal pass ran clean, zero eligible for the empty test env — correct
fail-closed-to-zero, not fabricated).

**The Consulting Tasks page now loads.** Ticket 1 + 2 + 2B complete.
**Ticket 3 (migration `10003`) is now safe to start** — no remaining live
board fault.

## Workstream B / Ticket 3 — Task hierarchy data model — DONE & VERIFIED 2026-05-19

`repo-b/db/schema/10003_consulting_task_hierarchy.sql`. PR **#73** merged to `main`
(merge commit `4a800d8ede60c6c02dde80906d4315e055e0dd45`). Schema-only — no app code, no
deploy needed (migration applied directly to live Supabase + independently re-applied and
verified by CI's **DB Schema Gate = SUCCESS**).

**Live schema verification (before):** none of the 10 hierarchy columns existed on
`cro_execution_task`; `cro_operating_domain`/`cro_initiative`/`cro_workstream` absent;
`10003` was the free number; board SELECT uses explicit columns (additive-safe). Type
discovery: `app.environments.env_id` is **uuid** while `cro_*.env_id` is **text** — the
seed `business_id` lookup casts accordingly (a `uuid = text` operator error was caught and
fixed during apply, not guessed).

**What shipped:**
- 10 nullable hierarchy columns on `cro_execution_task` (`domain_key`, `initiative_key`,
  `workstream_key`, `parent_task_id` self-FK `ON DELETE SET NULL`, `source_kind`,
  `related_entity_type/_id/_url`, `evidence`, `last_reviewed_at`) + 2 grouping indexes.
  No status/type/impact/date columns duplicated — reuses existing.
- `cro_operating_domain` / `cro_initiative` / `cro_workstream` — `env_id`+`business_id`,
  RLS `USING (env_id = current_setting('app.env_id', true))` per ARCHITECTURE.md.
- Seeds (env `62cfd59c…`, `business_id` `225f52ca-cdf4-4af9-a973-d1d310ddcba1` resolved
  authoritatively from `app.environments` → `cro_outreach_log` → `cro_execution_task`,
  self-skips rather than fabricate): 5 controlled domains, FlowYorker initiative + 7
  workstreams, 6 Novendor industry initiatives.
- 9 companion verification queries; idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`).

**Verified live (post-apply):** 6a cols=10, 6b tables=3, 6c RLS=3, 6d domains=5,
6e flowyorker=1, 6f industry=6, 6g workstreams=7, seed `business_id` single distinct =
`225f52ca…`. `cro_execution_task` has 0 rows total (fresh board) so nothing was rewritten.
Existing board endpoint still **HTTP 200** post-migration. 19 backend tests pass
(`test_execution_board_route`, `test_execution_auto_stage_query`, `test_executions`,
`test_consulting_pipeline`, `test_pipeline_execution_engine`).

> Repo Guardrails `1000` duplicate-prefix is pre-existing baseline (`10000_`/`10001_`
> collapse under `^(\d{4})`; tips #18). `10003` adds no new collision class. CI DB Schema
> Gate (the authoritative migration check) passed.

**Ticket 4 (UI domain grouping in `ExecutionBoard.tsx`) is now safe to start** — the
hierarchy columns + reference tables + seeds exist and are verified live.

## Workstream C — Tasks page UI hierarchy (deferred)

Add domain grouping + initiative/workstream filter to `ExecutionBoard.tsx` **without** removing
the Today / This Week / Waiting / Done lanes. Dark operator shell preserved; left nav stays
≤7 items (Pipeline, Accounting, Contacts, Tasks unchanged).

## Workstream D — FlowYorker / Web Properties (deferred)

FlowYorker.com as the first `web_properties` initiative with its 7 workstreams; web-property
task fields via `related_entity_type='web_property'` + `related_url`.

## Workstream E — Outreach / CRM integration (deferred)

Link tasks to existing `crm_account` / `crm_contact` / `crm_opportunity` / `crm_activity`
(already env-scoped) via existing `linked_deal_id` / `linked_contact_id` + new `related_entity_type`.

## Workstream F — Coding / implementation-plan integration (deferred)

`coding_platform` tasks reference active plans via `related_entity_type='impl_plan'` +
`related_url` to `docs/plans/03-implementation-plans/active/*`.

## Workstream G — Morning Checklist (deferred)

Read-only generated view over `cro_execution_task` (priority + due + status + domain +
next_action). No new table unless audit history is required.

## Workstream H — Assistant / Claude CoWork retrieval (deferred)

Novendor copilot answers "what should I do this morning / show FlowYorker tasks / what outreach
is overdue / what coding ticket is next" from real board state. Fail-closed when context is
missing; risky writes still gated.

---

## Acceptance Criteria

### Ticket 1 — verified 2026-05-19
- [x] Board route no longer raises `emit_log() got an unexpected keyword argument 'exc_info'`.
- [x] On auto-generation failure the API fails closed: HTTP 500, body
      `{"detail": {"error_code": "INTERNAL_ERROR", "message": "500: Auto-task generation unavailable"}}`;
      no raw stack trace in the response.
- [x] Failure log line includes request_id, env_id, business_id, structured `error`
      (name/message/stack) via `emit_log(..., error=auto_exc)` (confirmed in captured stdout).
- [x] Regression tests added (`backend/tests/test_execution_board_route.py`, 2 tests, both pass).
- [x] No regression: `consulting.py` parses; 15 related tests pass; no schema/UI change; no other
      environment touched.

### Later workstreams (B–H) — deferred
- Existing schema reused; any new schema additive + env-scoped + RLS + verification queries.
- Missing hierarchy fields show honest empty states — never fabricated values.
- Assistant retrieves real board state, does not invent task state, fails closed, gates writes.
- Tests: typecheck, backend route tests, Playwright `/consulting/tasks` smoke, dark-mode visual
  check, failed-generation error-state test.

---

## Ticket order

1. ~~Fix `emit_log(..., exc_info=...)` at `consulting.py:2449`~~ — **DONE 2026-05-19**
2. ~~Inventory existing task/CRM/accounting schema → `cro_execution_task` is the spine~~ — **DONE (this dispatch)**
3. `10003_consulting_task_hierarchy.sql` additive migration + seeds + verification queries ← **NEXT**
4. Domain grouping + filters in `ExecutionBoard.tsx`
5. FlowYorker initiative + web-property fields
6. Outreach/CRM task linkage
7. Coding / impl-plan task linkage
8. Morning Checklist generated view
9. Assistant / CoWork retrieval path
10. Tests, visual receipts, docs, `docs/tips.md`

---

## Verification (Ticket 1) — results

| Step | Command / check | Result |
|---|---|---|
| Bug confirmed | `consulting.py:2449` positional + `exc_info=`; `emit_log` keyword-only | Confirmed |
| Fix applied | `consulting.py:2448-2456` keyword-only `emit_log(..., error=auto_exc)` | Applied |
| Regression tests | `cd backend && python -m pytest tests/test_execution_board_route.py -v` | 2 passed |
| No regression | `python -m pytest tests/test_executions.py tests/test_consulting_pipeline.py tests/test_pipeline_execution_engine.py -q` | 15 passed |
| Syntax | `python -c "import ast; ast.parse(open('app/routes/consulting.py').read())"` | OK |

UI/manual API smoke against a running backend not performed this session (no running backend);
the structured log + fail-closed body are proven by the TestClient run captured in test output.

## Risk & rollback
- Ticket 1 risk realized: minimal. Success path unchanged. If a deeper fault exists in
  `execution_auto.run_auto_generation`, the fix now surfaces it cleanly instead of masking it —
  tracked in backlog.
- Rollback: revert the `consulting.py` change + delete `tests/test_execution_board_route.py`.
- Workstreams B–H not implemented — no schema/UI risk incurred this session.
