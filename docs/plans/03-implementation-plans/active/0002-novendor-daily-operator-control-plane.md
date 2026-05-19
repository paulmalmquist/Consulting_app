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

## Workstream B — Task hierarchy data model (deferred)

Migration `10003_consulting_task_hierarchy.sql` per the Domain model section. Additive only,
env-scoped, RLS on every new table, verification queries, seed the 5 domains + FlowYorker +
industry initiatives. Schema discovery is sufficient for planning; **Ticket 3 must still verify
current production schema** (`supabase db query --linked` against `ozboonlsplroialdwuxj`) before
writing the migration — a stale local read must not become a bad prod migration.

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
