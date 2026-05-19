# Novendor CRM / Accounting — Architecture

**Last updated:** 2026-05-16  
**Status:** Draft — partially verified from route/service inspection

## Frontend map

### Routes (CRM)
| Route | File | Purpose |
|---|---|---|
| `/novendor/*` | `repo-b/src/app/novendor/` | Novendor CRM surfaces |
| `/lab/env/[envId]/blueprint` | `repo-b/src/app/lab/env/[envId]/blueprint/` | Blueprint view |
| `/lab/env/[envId]/case-factory` | `repo-b/src/app/lab/env/[envId]/case-factory/` | Case factory |
| `/lab/env/[envId]/copilot` | `repo-b/src/app/lab/env/[envId]/copilot/` | AI copilot |
| `/lab/env/[envId]/discovery` | `repo-b/src/app/lab/env/[envId]/discovery/` | Discovery sessions |
| `/lab/env/[envId]/impact` | `repo-b/src/app/lab/env/[envId]/impact/` | Impact estimator |
| `/lab/env/[envId]/pilot` | `repo-b/src/app/lab/env/[envId]/pilot/` | Pilot builder |

### Routes (Accounting Command Desk)
| Route | File | Purpose |
|---|---|---|
| `/lab/env/[envId]/ecc` | `repo-b/src/app/lab/env/[envId]/ecc/` | Accounting Command Center main |
| `/lab/env/[envId]/ecc/admin` | `repo-b/src/app/lab/env/[envId]/ecc/admin/` | Admin panel |
| `/lab/env/[envId]/ecc/approvals` | `repo-b/src/app/lab/env/[envId]/ecc/approvals/` | Approval queue |
| `/lab/env/[envId]/ecc/brief` | `repo-b/src/app/lab/env/[envId]/ecc/brief/` | Accounting brief |
| `/lab/env/[envId]/ecc/messages` | `repo-b/src/app/lab/env/[envId]/ecc/messages/` | Message surface |
| `/lab/env/[envId]/ecc/vips` | `repo-b/src/app/lab/env/[envId]/ecc/vips/` | VIP contacts |
| `/lab/env/[envId]/accounting` | `repo-b/src/app/lab/env/[envId]/accounting/` | Accounting overview |
| `/lab/env/[envId]/operator/accounting` | `repo-b/src/app/lab/env/[envId]/operator/accounting/` | Operator accounting view |

### API routes (frontend-side)
| Route | File | Purpose |
|---|---|---|
| `/api/ecc/*` | `repo-b/src/app/api/ecc/` | ECC API endpoints (brief, delegate, demo, ingest, message, payable, queue, quick_capture, task, vips) |

## Backend map

### Routes
| Method | Endpoint | File | Purpose |
|---|---|---|---|
| * | `/api/v1/nv/accounting-desk/*` | `backend/app/routes/nv_accounting_desk.py` | Accounting desk operations |
| * | `/api/v1/nv/ai-copilot/*` | `backend/app/routes/nv_ai_copilot.py` | AI copilot |
| * | `/api/v1/nv/case-factory/*` | `backend/app/routes/nv_case_factory.py` | Case factory |
| * | `/api/v1/nv/discovery/*` | `backend/app/routes/nv_discovery.py` | Discovery sessions |
| * | `/api/v1/nv/engagement/*` | `backend/app/routes/nv_engagement_output.py` | Engagement outputs |
| * | `/api/v1/nv/exec-blueprint/*` | `backend/app/routes/nv_exec_blueprint.py` | Executive blueprint |
| * | `/api/v1/nv/impact/*` | `backend/app/routes/nv_impact_estimator.py` | Impact estimator |
| * | `/api/v1/nv/metric-dict/*` | `backend/app/routes/nv_metric_dict.py` | Metric dictionary |
| * | `/api/v1/nv/pilot/*` | `backend/app/routes/nv_pilot_builder.py` | Pilot builder |
| * | `/api/v1/nv/receipts/*` | `backend/app/routes/nv_receipt_intake.py` | Receipt intake |
| * | `/api/v1/nv/tasks/*` | `backend/app/routes/nv_tasks.py` | Task management |
| * | `/api/v1/nv/vendor-intel/*` | `backend/app/routes/nv_vendor_intel.py` | Vendor intelligence |
| * | `/api/v1/nv/workflow-intel/*` | `backend/app/routes/nv_workflow_intel.py` | Workflow intelligence |
| * | `/api/v1/crm/*` | `backend/app/routes/crm.py` | CRM operations |

### Services (Accounting)
| Service | File | Purpose |
|---|---|---|
| Accounting KPIs | `backend/app/services/nv_accounting_kpis.py` | KPI calculations |
| Accounting queue | `backend/app/services/nv_accounting_queue.py` | Queue management |
| Accounting trends | `backend/app/services/nv_accounting_trends.py` | Trend analysis |
| Accounting engine | `backend/app/services/accounting_engine.py` | Core accounting engine |
| Accounting snapshot | `backend/app/services/accounting_snapshot_writer.py` | Snapshot persistence |

### Services (CRM / Novendor)
| Service | File | Purpose |
|---|---|---|
| AI copilot | `backend/app/services/nv_ai_copilot.py` | CRM AI layer |
| Case factory | `backend/app/services/nv_case_factory.py` | Case generation |
| Discovery | `backend/app/services/nv_discovery.py` | Discovery session management |
| Impact estimator | `backend/app/services/nv_impact_estimator.py` | ROI/impact calculations |
| Outreach | `backend/app/services/nv_outreach.py` | Outreach automation |

### Schemas
| Schema | File |
|---|---|
| Accounting desk | `backend/app/schemas/nv_accounting_desk.py` |
| AI copilot | `backend/app/schemas/nv_ai_copilot.py` |
| Case factory | `backend/app/schemas/nv_case_factory.py` |
| Discovery | `backend/app/schemas/nv_discovery.py` |
| Receipt intake | `backend/app/schemas/nv_receipt_intake.py` |
| Vendor intel | `backend/app/schemas/nv_vendor_intel.py` |

## Data map

### Consulting Tasks / Execution Board (verified 2026-05-19)

The `/lab/env/[envId]/consulting/tasks` board is **NOT** backed by `app.task_*` or `nv_tasks`
(those are separate, unrelated task systems — do not extend them for consulting tasks).

- **Spine table:** `cro_execution_task` — `repo-b/db/schema/525_execution_board.sql`
  (+ `604_cro_execution_task_re_engage.sql` adds `re_engage_at`, `blocked_reason`).
  env-scoped (`env_id` TEXT, `business_id` UUID), RLS `env_id = current_setting('app.env_id', true)`.
  Flat status (`today`/`this_week`/`waiting`/`done`), `type` enum, `impact` 1–5, `next_action`,
  `why_now`, `linked_deal_id` → `crm_opportunity`, `linked_contact_id` → `crm_contact`.
- **Route:** `GET /api/consulting/execution/board` → `backend/app/routes/consulting.py:2433`
  (`router` prefix `/api/consulting`; FE calls it via `/bos/api/consulting/...`).
- **Service:** `backend/app/services/execution_tasks.py` (CRUD), `execution_auto.py` (auto-gen passes).
- **Frontend:** `repo-b/src/components/consulting/execution/ExecutionBoard.tsx` (lanes + quick
  capture + Generate), `repo-b/src/lib/cro-api.ts`.
- Hierarchy buildout (Domain→Initiative→Workstream) is **additive on `cro_execution_task`** via
  planned migration `10003` — see dispatch `0002`.

### Other (still needs repo verification)

- CRM/accounting tables: `crm_account`, `crm_contact`, `crm_opportunity`, `crm_activity`
  (env-scoped per schema inventory), `nv_receipt_intake`, `nv_subscription_ledger`, etc. —
  confirm against Supabase before relying on column shapes.
- Design handoff artifacts: `design_handoff_accounting_command_desk/`

## AI / MCP / Runtime map

- NV AI copilot route: `backend/app/routes/nv_ai_copilot.py`
- NV AI copilot service: `backend/app/services/nv_ai_copilot.py`
- Apollo MCP: available via `mcp__claude_ai_Apollo_io__*` tools
- Gmail MCP: available via `mcp__claude_ai_Gmail__*` tools

## Test map

- Needs repo verification — check `backend/tests/` for nv_* test files

## Needs verification

- [ ] Supabase table names for CRM and accounting records
- [ ] Whether the ECC frontend routes are connected to real backend data
- [ ] Receipt ingestion flow: how receipts arrive, are processed, and appear in the accounting queue
- [ ] Apollo CRM sync: how Apollo contacts are pulled into Novendor CRM
