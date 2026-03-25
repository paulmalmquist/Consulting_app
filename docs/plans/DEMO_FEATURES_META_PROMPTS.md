---
id: demo-features-meta-prompts
kind: prompt
status: active
source_of_truth: true
topic: demo-feature-build-sequence
owners:
  - docs
  - backend
  - repo-b
intent_tags:
  - build
  - demo
  - repe
triggers:
  - demo feature meta prompts
  - build demo features
  - build LP letter automation
  - build audit trail
  - build UW vs actual scan
  - build deal radar rate sensitivity
  - build accuracy scorecard
entrypoint: true
handoff_to:
  - feature-dev
  - agents/mcp.md
  - agents/data.md
when_to_use: "Use when building the Winston demo features identified in docs/demo-ideas/2026-03-20.md. Each prompt (D1–D5) is independently executable. Run in dependency order or parallelize D3/D4."
when_not_to_use: "Do not use for PDS or credit decisioning builds — those have their own meta prompt sequences."
surface_paths:
  - backend/app/mcp/tools/
  - backend/app/services/
  - repo-b/src/app/app/
  - repo-b/src/components/winston/
notes:
  - Generated from docs/demo-ideas/2026-03-20.md
  - D3 and D4 can run in parallel — they touch different services and tool files
  - D2 should ship before D5 — D5 builds on the audit event model D2 creates
---

# Winston Demo Features — Meta Prompt Sequence

**Purpose:** Convert the five Winston demo concepts from `docs/demo-ideas/2026-03-20.md` into shipped product features. Each prompt is executable end-to-end by a single session.

**Stack:** FastAPI (backend) · Next.js 14 App Router (repo-b) · Supabase PostgreSQL · MCP tool registry (`backend/app/mcp/`) · SSE streaming AI workspace

**Live demo environment:**
- `envId`: `a1b2c3d4-0001-0001-0003-000000000001`
- `businessId`: `a1b2c3d4-0001-0001-0001-000000000001`
- Primary fund (IGF-VII): `a1b2c3d4-0003-0030-0001-000000000001`

---

## Dependency Graph

```
D2  AI Decision Audit Trail (foundation)
 │
 └──► D5  Accuracy Scorecard (builds on audit event model)

D3  Portfolio UW vs Actual MCP Scan      ← independent, ready now
D4  Deal Radar Rate Sensitivity MCP      ← independent, ready now
D1  LP Letter Automation + Approval Gate ← partially ready (service exists)
```

D3 and D4 have no cross-dependencies and can be executed in parallel sessions.
D1 can ship the chat-only path immediately; the approval gate UI is the remaining build.
D2 must complete before D5 starts.

---

## D1 — LP Letter Automation + IR Approval Gate

### Context

`backend/app/mcp/tools/lp_report_tools.py` already exposes `finance.assemble_lp_report` and `finance.generate_gp_narrative`. The existing service (`backend/app/services/lp_report_assembler.py`) assembles fund metrics, LP capital accounts, and GP narrative from live waterfall data. What is missing:

1. An `ir.draft_lp_letter` MCP tool that wraps `generate_gp_narrative` and adds structured LP letter formatting (salutation, fund performance section, asset highlights, market outlook paragraph, closing)
2. An `ir.generate_lp_capital_statements` MCP tool that returns per-LP capital account snapshots formatted for individual distribution
3. An approval gate: a `repo-b/src/app/app/ir/review/page.tsx` page where IR staff can review AI-drafted letters before they are queued for delivery
4. A `re_ir_drafts` Supabase table to persist drafts, their status (`draft` / `approved` / `rejected`), and the reviewer's notes

### Prompt

> **You are extending Winston's LP reporting surface to add IR letter automation.**
>
> **What already exists:**
> - `backend/app/mcp/tools/lp_report_tools.py` — `finance.assemble_lp_report` and `finance.generate_gp_narrative` registered and working
> - `backend/app/services/lp_report_assembler.py` — assembles fund metrics, LP capital accounts, variance data, GP narrative string
> - `backend/app/services/re_waterfall.py` — live waterfall allocation and LP distribution data
> - `repo-b/src/app/app/re/[envId]/lp-summary/page.tsx` — LP Summary page with waterfall and capital account UI
>
> **Build the following:**
>
> **Step 1 — `re_ir_drafts` Supabase migration** (`repo-b/db/schema/280_re_ir_drafts.sql`):
> - `draft_id` uuid PK (gen_random_uuid())
> - `business_id` uuid NOT NULL FK → business
> - `env_id` uuid NOT NULL
> - `fund_id` uuid NOT NULL
> - `quarter` text NOT NULL (e.g. "2026-Q1")
> - `draft_type` text CHECK (draft_type IN ('lp_letter', 'capital_statement'))
> - `target_lp_id` uuid NULLABLE (NULL = fund-wide letter)
> - `content` text NOT NULL (the AI-generated markdown)
> - `status` text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected'))
> - `reviewer_notes` text
> - `reviewed_by` text
> - `reviewed_at` timestamptz
> - Standard timestamps + RLS on business_id
>
> **Step 2 — New MCP tools in `backend/app/mcp/tools/lp_report_tools.py`:**
>
> `ir.draft_lp_letter` — wraps `generate_gp_narrative` and formats a full LP letter:
> - Input schema: `env_id`, `business_id`, `fund_id`, `quarter`, `market_outlook_note` (optional override string)
> - Calls `assemble_lp_report` to get fund metrics and LP data
> - Calls `generate_gp_narrative` for the narrative block
> - Assembles a structured letter: Dear [Fund Name] LP, Performance Summary (IRR, TVPI, DPI pulled from live data), Top Asset Highlights (top 3 assets by NOI), Market Outlook, Closing
> - Persists the draft to `re_ir_drafts` with `status = 'draft'`
> - Returns `{ draft_id, fund_id, quarter, content, status }`
>
> `ir.generate_lp_capital_statements` — per-LP capital account snapshots:
> - Input schema: `env_id`, `business_id`, `fund_id`, `quarter`, `lp_ids` (list of UUID strings, optional — if omitted generates for all LPs)
> - Queries `re_lp_capital_ledger` and `re_lp_partner` for each LP
> - Returns a list of `{ lp_id, lp_name, committed_capital, called_capital, distributions, nav, unrealized_gain_pct, dpi, rvpi, tvpi }`
>
> `ir.get_draft` — fetch a draft by ID:
> - Input: `draft_id`
> - Returns full draft record including content and status
>
> `ir.approve_draft` / `ir.reject_draft` — update draft status:
> - Input: `draft_id`, `reviewer_notes` (optional)
> - Updates `re_ir_drafts.status` and `reviewed_at`, `reviewed_by`
> - Returns updated draft record
>
> **Step 3 — IR Review page at `repo-b/src/app/app/re/[envId]/ir/review/page.tsx`:**
> - Lists all `re_ir_drafts` for the current business/env with status badges (draft / approved / rejected)
> - Click a draft → full-screen preview with the formatted letter content (render as markdown)
> - Two buttons: "Approve" and "Reject" — call the MCP `ir.approve_draft` / `ir.reject_draft` tools via the existing MCP proxy pattern
> - Reviewer notes textarea shown on reject
> - Approved drafts show a "Download PDF" button (use existing PDF export utilities in repo-b)
> - Add "IR Review" to the left nav under the RE environment shell
>
> **Step 4 — Register new tools** in `backend/app/mcp/tools/lp_report_tools.py` `register_lp_report_tools()` function using the existing `ToolDef` / `registry.register` pattern. Tags: `frozenset({"repe", "ir", "finance", "investor"})`.
>
> **Conventions:**
> - Follow the exact `McpContext` / `ToolDef` pattern in existing lp_report_tools.py
> - Schema classes go in `backend/app/mcp/schemas/lp_report_tools.py` alongside existing schemas
> - MCP proxy API route pattern: `repo-b/src/app/api/mcp/[tool]/route.ts`
> - Use `business_id` from session context (McpContext) — never accept it as a free-form user input
> - All SQL must use parameterized queries

### Verification
- `POST /mcp/ir.draft_lp_letter` with IGF-VII fund_id + "2026-Q1" returns a `draft_id` and a non-empty `content` string containing the fund name
- `POST /mcp/ir.generate_lp_capital_statements` returns at least 3 LP records with non-zero `tvpi`
- Navigate to `/app/re/[envId]/ir/review` — draft appears with "draft" status badge
- Click "Approve" → status badge updates to "approved" without page reload
- `re_ir_drafts` table exists with correct columns: `SELECT column_name FROM information_schema.columns WHERE table_name = 're_ir_drafts'`

---

## D2 — AI Decision Audit Trail

### Context

Every Winston AI response involves one or more MCP tool invocations. Currently those invocations are logged to `backend/app/mcp/audit.py` in a lightweight way, but there is no structured per-decision audit table, no frontend surface, and no export capability. This prompt builds the full governance layer.

This is the prerequisite for D5 (Accuracy Scorecard) — both share the `ai_decision_audit_log` table.

### Prompt

> **You are building Winston's AI Decision Audit Trail — a per-request governance log that makes every AI-assisted decision traceable and exportable.**
>
> **What already exists:**
> - `backend/app/mcp/audit.py` — lightweight MCP audit logging (basic call log)
> - `backend/app/services/audit.py` — draw audit / document audit patterns (reference for style)
> - `backend/app/mcp/server.py` — MCP server where tool dispatch happens; this is where middleware hooks go
> - `backend/app/services/ai_gateway.py` — AI gateway service; each AI response has a `conversation_id` and `message_id`
>
> **Build the following:**
>
> **Step 1 — `ai_decision_audit_log` Supabase migration** (`repo-b/db/schema/281_ai_decision_audit_log.sql`):
> - `audit_id` uuid PK (gen_random_uuid())
> - `business_id` uuid NOT NULL FK → business
> - `env_id` uuid
> - `conversation_id` uuid (FK → ai_conversations if exists, otherwise plain uuid)
> - `message_id` uuid
> - `user_id` text NOT NULL (actor identifier from McpContext)
> - `tool_name` text NOT NULL (e.g. "finance.get_fund_metrics")
> - `tool_input` jsonb (sanitized — strip PII fields: email, ssn, phone)
> - `tool_output_summary` text (first 500 chars of output, for audit display)
> - `model_used` text
> - `decision_type` text CHECK (decision_type IN ('read', 'analysis', 'recommendation', 'write', 'approval'))
> - `risk_flag` boolean DEFAULT false (set true when tool is in high-risk category)
> - `user_action` text CHECK (user_action IN ('accepted', 'modified', 'rejected', 'pending')) DEFAULT 'pending'
> - `grounding_score` numeric(4,3) NULLABLE (0.000–1.000; populated by D5)
> - `created_at` timestamptz DEFAULT now()
> - Index on (business_id, created_at DESC)
> - Index on (business_id, risk_flag) WHERE risk_flag = true
> - RLS on business_id
>
> **Step 2 — Audit middleware in `backend/app/mcp/server.py`:**
> - After every successful tool dispatch, call `log_audit_event(ctx, tool_name, inp, result)` (non-blocking — use `asyncio.create_task` or a background thread so it never adds latency to the tool response)
> - `log_audit_event` inserts a row to `ai_decision_audit_log` with the fields above
> - High-risk tools (list in a `HIGH_RISK_TOOLS` constant in `backend/app/mcp/audit.py`): any tool with `permission="write"` plus explicitly: `finance.approve_draft`, `ir.approve_draft`, `credit.*`
> - Sanitize `tool_input` before storing: strip any key matching `(email|ssn|phone|password|token|secret)` (case-insensitive)
>
> **Step 3 — `backend/app/services/governance.py`** — query service:
> - `get_audit_log(business_id, env_id=None, risk_only=False, limit=100, offset=0) -> list[dict]`
> - `get_audit_stats(business_id, env_id=None, since_days=90) -> dict` — returns `{ total_decisions, high_risk_count, override_rate, top_tools: list }`
> - `export_audit_pdf(business_id, env_id, since_days=90) -> bytes` — generates a PDF audit report using the existing PDF export pattern in the repo; include: cover page with business name + date range, stats summary, table of all decisions with tool_name / user_id / created_at / risk_flag / user_action
>
> **Step 4 — New MCP tools in `backend/app/mcp/tools/` (new file: `governance_tools.py`)**:
> - `governance.get_audit_log` — wraps `governance.get_audit_log()` service; input: `env_id`, `risk_only` (bool), `limit` (int, default 50)
> - `governance.get_audit_stats` — wraps `governance.get_audit_stats()`; input: `env_id`, `since_days` (int, default 90)
> - `governance.export_audit_report` — calls `export_audit_pdf` and returns a signed Supabase Storage URL for the generated PDF
> - Tags: `frozenset({"governance", "audit", "compliance"})`; `permission="read"` on all
>
> **Step 5 — Governance dashboard page at `repo-b/src/app/app/re/[envId]/governance/page.tsx`:**
> - Top stat bar: Total AI Decisions · High-Risk Decisions · Override Rate · Decisions This Quarter (data from `governance.get_audit_stats`)
> - Audit log table: columns = Timestamp · Tool · User · Decision Type · Risk Flag · User Action — filterable by risk_flag and decision_type
> - "Export Audit Report" button → calls `governance.export_audit_report` → opens PDF in new tab
> - Add "Governance" to the left nav under the RE environment shell (after Documents)
>
> **Conventions:**
> - The audit insert must NEVER throw — wrap in try/except and log to observability if it fails; never surface errors to the user
> - Use existing `emit_log` from `app.observability.logger` for internal errors
> - Follow `ToolDef` / `registry.register` pattern from `lp_report_tools.py`
> - Register in the existing `register_*_tools()` call chain in `backend/app/mcp/__init__.py` or equivalent bootstrap

### Verification
- Run any Winston AI query in the demo environment → `SELECT COUNT(*) FROM ai_decision_audit_log WHERE business_id = '[demo_business_id]'` increments
- `POST /mcp/governance.get_audit_stats` returns `{ total_decisions: N, high_risk_count: M, override_rate: float }`
- Navigate to `/app/re/[envId]/governance` — stat bar shows non-zero values, audit log table renders
- Click "Export Audit Report" → PDF downloads with correct date range and decision count
- Confirm audit insert does NOT add measurable latency: run a tool and compare response time with/without the background insert

---

## D3 — Portfolio UW vs Actual Scan MCP Tool

### Context

`backend/app/services/re_uw_vs_actual.py` already implements underwriting linkage and per-investment variance comparison. What is missing is a portfolio-wide scan MCP tool that calls this service for every active investment in an environment and returns a ranked variance list. Winston can call this tool in response to "scan all assets for NOI variances" prompts.

### Prompt

> **You are adding a portfolio-wide UW vs Actual scan MCP tool to Winston's REPE analysis surface.**
>
> **What already exists:**
> - `backend/app/services/re_uw_vs_actual.py` — `link_underwriting()`, variance comparison logic, and per-investment metric diffs
> - `backend/app/mcp/tools/repe_analysis_tools.py` — `repe.compare_waterfall_runs` and `repe.get_noi_variance` registered; follow this file's exact pattern
> - `backend/app/mcp/schemas/repe_analysis_tools.py` — existing input schemas; add new schemas here
> - `re_investment`, `re_investment_underwriting_link`, `re_investment_quarter_state` tables in Supabase
>
> **Build the following:**
>
> **New input schema in `backend/app/mcp/schemas/repe_analysis_tools.py`:**
> ```python
> class PortfolioUwScanInput(BaseModel):
>     env_id: str
>     business_id: str
>     fund_id: Optional[str] = None          # if None, scan all funds in env
>     variance_threshold_pct: float = 10.0   # flag assets above this % variance
>     metric: str = "noi"                    # "noi" | "dscr" | "occupancy"
>     limit: int = 33                        # max assets to scan
> ```
>
> **New handler `_scan_portfolio_uw_vs_actual` in `repe_analysis_tools.py`:**
> - Query `re_investment` for all active investments in `env_id` (and optionally `fund_id`)
> - For each investment, call the existing variance logic from `re_uw_vs_actual` to get `actual` vs `underwritten` values for the requested metric
> - Filter to investments where `abs(variance_pct) >= variance_threshold_pct`
> - Sort descending by `abs(variance_pct)`
> - Return:
>   ```json
>   {
>     "scanned": 33,
>     "flagged": 5,
>     "threshold_pct": 10.0,
>     "metric": "noi",
>     "results": [
>       {
>         "investment_id": "...",
>         "asset_name": "...",
>         "fund_name": "...",
>         "variance_pct": -18.4,
>         "actual_value": 2100000,
>         "underwritten_value": 2572000,
>         "delta": -472000,
>         "latest_quarter": "2025-Q4",
>         "dscr_current": 1.12,
>         "debt_maturity_months": 14,
>         "risk_flag": "high"
>       }
>     ]
>   }
>   ```
> - `risk_flag`: "high" if variance > 15% or DSCR < 1.20, "medium" if variance 10–15% or DSCR 1.20–1.35, "low" otherwise
> - If an investment has no linked underwriting model, include it with `variance_pct: null` and `risk_flag: "no_baseline"`
>
> **Register in `register_repe_analysis_tools()`:**
> ```python
> registry.register(ToolDef(
>     name="repe.scan_portfolio_uw_vs_actual",
>     description="Scan all active portfolio assets and return a ranked list of those with NOI, DSCR, or occupancy variance exceeding a threshold vs their locked underwriting model. Returns risk flags and debt maturity context.",
>     module="bm",
>     permission="read",
>     input_model=PortfolioUwScanInput,
>     handler=_scan_portfolio_uw_vs_actual,
>     tags=frozenset({"repe", "analysis", "underwriting", "portfolio"}),
> ))
> ```
>
> **Demo data check:** Verify that at least 3 of the 33 demo investments have `re_investment_underwriting_link` records AND `re_investment_quarter_state` rows for Q4 2025. If fewer than 3 have baselines, update the seed function in `backend/app/services/re_seed.py` (or equivalent) to link underwriting models to at least 5 investments with NOI variance between −10% and −25%.

### Verification
- `POST /mcp/repe.scan_portfolio_uw_vs_actual` with demo `env_id`, `variance_threshold_pct: 10` returns `scanned: 33` and `flagged >= 3`
- Each flagged result has non-null `asset_name`, `variance_pct`, and `risk_flag`
- Ask Winston in the chat: *"Scan all assets and rank NOI variances above 10%"* — the tool is selected by intent classification and returns the ranked list in the response

---

## D4 — Deal Radar Rate Sensitivity MCP Tool

### Context

`backend/app/services/re_deal_scoring.py` handles deal pipeline scoring. The Deal Radar page surfaces 8 active deals with IRR, risk, and return metrics. What is missing is a rate sensitivity MCP tool that takes a set of deals (or all deals in an env), applies a user-specified interest rate scenario, and returns the impact on each deal's IRR and debt coverage.

### Prompt

> **You are adding a rate sensitivity analysis MCP tool to Winston's Deal Radar surface.**
>
> **What already exists:**
> - `backend/app/services/re_deal_scoring.py` — deal scoring and pipeline logic
> - `backend/app/mcp/tools/repe_ops_tools.py` or `repe_tools.py` — deal-related MCP tools; place new tool here
> - `re_investment` table — contains deal pipeline records including `cap_rate_assumption`, `irr_target`, `entry_price`, `financing_terms` (or equivalent columns — inspect schema to confirm exact column names before writing queries)
>
> **Build the following:**
>
> **New input schema** (add to appropriate schema file):
> ```python
> class DealRateScenarioInput(BaseModel):
>     env_id: str
>     business_id: str
>     fund_id: Optional[str] = None
>     rate_change_bps: int = 0              # e.g. 0 = hold, -25 = one cut, +50 = two hikes
>     cap_rate_compression_bps: int = 0     # expected cap rate change vs underwriting
>     deal_ids: Optional[List[str]] = None  # if None, analyze all pipeline deals
> ```
>
> **New handler `_run_deal_rate_scenario`:**
> - Fetch pipeline deals from `re_investment` where `status IN ('pipeline', 'loi', 'under_contract')`
> - For each deal:
>   - Retrieve `cap_rate_assumption`, `irr_target`, `entry_price`, `debt_amount` (or equivalent columns)
>   - Apply rate scenario: `adjusted_cap_rate = cap_rate_assumption + cap_rate_compression_bps / 10000`
>   - Estimate exit value: `exit_value = noi / adjusted_cap_rate` (use most recent NOI projection or `noi_t1` column)
>   - If `rate_change_bps != 0`: apply to floating-rate portion of debt (use `floating_rate_pct` column if present, else assume 60% floating)
>   - Compute `adjusted_irr` (simplified: if exit value changes by X%, IRR changes proportionally — use `irr_target * (exit_value / base_exit_value)`)
>   - Compute `adjusted_dscr` if rate changes affect debt service
> - Return ranked list (by `irr_delta`) with:
>   ```json
>   {
>     "scenario": { "rate_change_bps": 0, "cap_rate_compression_bps": 5 },
>     "deals": [
>       {
>         "deal_id": "...",
>         "deal_name": "...",
>         "irr_target": 0.182,
>         "adjusted_irr": 0.164,
>         "irr_delta": -0.018,
>         "cap_rate_assumption": 0.055,
>         "adjusted_cap_rate": 0.0555,
>         "risk_rating": "elevated",
>         "note": "Floating rate exposure ~60% — meaningful debt service increase at +50bps"
>       }
>     ]
>   }
>   ```
> - `risk_rating`: "elevated" if `irr_delta < -0.020`, "watch" if `-0.020 <= irr_delta < -0.010`, "stable" otherwise
>
> **Register** with name `"repe.run_deal_rate_scenario"`, description: `"Apply an interest rate and cap rate scenario to the active deal pipeline. Returns IRR impact, adjusted DSCR, and risk ratings for each deal — ready for IC review."`, tags `frozenset({"repe", "deals", "scenario", "pipeline"})`, `permission="read"`.
>
> **IMPORTANT:** Before writing any SQL, inspect the actual `re_investment` columns:
> ```sql
> SELECT column_name, data_type FROM information_schema.columns
> WHERE table_name = 're_investment' ORDER BY ordinal_position;
> ```
> Map column names to the schema variables above. Use actual column names — do not guess.

### Verification
- `POST /mcp/repe.run_deal_rate_scenario` with demo `env_id`, `cap_rate_compression_bps: 5` returns 8 deals (matching the Deal Radar count) with non-null `irr_delta` on each
- Ask Winston: *"The Fed held rates. Which pipeline deals are most at risk if cap rates only compress 5bps?"* — tool is invoked and returns ranked risk list
- Verify `risk_rating` logic: a deal with `irr_delta = -0.025` must return `"elevated"`

---

## D5 — Accuracy Scorecard (Response Grounding Score)

### Context

This prompt builds on D2 (`ai_decision_audit_log` table and governance service). The goal is to surface a per-response confidence indicator in the Winston AI workspace — showing what percentage of each answer came from the firm's verified data vs. general model knowledge — and to aggregate those scores into a dashboard widget and exportable LP report.

**Run D2 before starting D5.**

### Prompt

> **You are adding response grounding scores and an Accuracy Scorecard to Winston's AI workspace.**
>
> **Prerequisites:**
> - `ai_decision_audit_log` table exists (from D2) with `grounding_score` column
> - `backend/app/services/governance.py` exists with `get_audit_stats()`
> - `backend/app/services/ai_gateway.py` — the AI response pipeline
>
> **Build the following:**
>
> **Step 1 — Grounding score calculation in `backend/app/services/ai_gateway.py`:**
> - After each AI response is assembled, compute `grounding_score`:
>   - Count the number of tool calls in the response that returned rows from the firm's own database (any tool with `tags` containing `"repe"`, `"finance"`, `"ir"`, or `"governance"`)
>   - Count total tool calls
>   - `grounding_score = firm_data_tools / max(total_tools, 1)`
>   - If no tools were called (pure model knowledge): `grounding_score = 0.0`
>   - If all tools returned firm data: `grounding_score = 1.0`
> - Store `grounding_score` on the AI response object
> - Update the corresponding `ai_decision_audit_log` row (`UPDATE ... SET grounding_score = %s WHERE conversation_id = %s AND message_id = %s`)
>
> **Step 2 — Grounding score in the SSE stream:**
> - Add a `grounding_score` field to the final SSE event (`event: done`) payload alongside existing metadata
> - Format: `{ "grounding_score": 0.94, "grounding_label": "High — 94% sourced from firm data", "tool_count": 7, "firm_data_tools": 6 }`
> - If `grounding_score < 0.5`: `grounding_label = "Low — primarily general knowledge"`
> - If `0.5 <= grounding_score < 0.8`: `grounding_label = "Mixed — firm and general knowledge"`
> - If `grounding_score >= 0.8`: `grounding_label = "High — [N]% sourced from firm data"`
>
> **Step 3 — Grounding badge in `repo-b/src/components/winston/` response renderer:**
> - After each AI message renders, show a small badge below the response content
> - Badge content: a colored dot (green ≥0.8, yellow 0.5–0.8, red <0.5) + the `grounding_label` string
> - Badge is low-profile — 12px text, muted color, does not compete with the response content
> - Clicking the badge expands a detail panel: lists each MCP tool called, whether it returned firm data or not, and the data source name (table/service name from tool tags)
>
> **Step 4 — Accuracy Dashboard widget at `repo-b/src/app/app/re/[envId]/governance/page.tsx`** (extends the D2 governance page):
> - Add a second section: "AI Accuracy Scorecard"
> - Stats: Avg Grounding Score (this quarter) · High-Confidence Responses (≥80%) · Mixed Responses (50–80%) · Low-Confidence Responses (<50%)
> - Time-series sparkline: avg grounding score by week over the last 12 weeks (use `ai_decision_audit_log.created_at` and `grounding_score`)
> - "Generate LP Accuracy Report" button — calls new MCP tool `governance.export_accuracy_report`
>
> **Step 5 — `governance.export_accuracy_report` MCP tool** (add to `governance_tools.py` from D2):
> - Input: `env_id`, `business_id`, `since_days` (default 90)
> - Calls `governance.get_audit_stats()` + queries grounding score distribution
> - Generates a PDF with: cover page ("Winston AI Accuracy Report — Q1 2026"), executive summary paragraph, stats table, grounding score distribution chart (rendered as a simple ASCII bar chart in the PDF if charting library not available), and a footer: "All AI-assisted decisions are logged and auditable. Contact your Winston administrator for the full audit trail."
> - Returns signed Supabase Storage URL
>
> **Conventions:**
> - The grounding score update to `ai_decision_audit_log` must be non-blocking (fire-and-forget)
> - The badge must not render on streaming partial responses — only on the final `done` event
> - The `grounding_score` should be `null` in the audit log until the response completes

### Verification
- Ask Winston a question that triggers 3+ REPE tools → grounding badge appears below response with green dot and "High — 90%+ sourced from firm data"
- Ask a general question with no tool calls ("What is cap rate compression?") → badge shows red dot and "Low — primarily general knowledge"
- Navigate to `/app/re/[envId]/governance` → Accuracy Scorecard section shows non-zero avg grounding score
- "Generate LP Accuracy Report" button → PDF downloads with correct stats
- `SELECT AVG(grounding_score) FROM ai_decision_audit_log WHERE business_id = '[demo_id]' AND grounding_score IS NOT NULL` returns a value between 0 and 1

---

## Build Order Summary

| Prompt | Feature | Depends On | Estimated Effort | Ready to Start |
|---|---|---|---|---|
| D3 | Portfolio UW vs Actual Scan | Nothing | Small (1 session) | ✅ Now |
| D4 | Deal Radar Rate Sensitivity | Nothing | Small (1 session) | ✅ Now |
| D1 | LP Letter + IR Approval Gate | Nothing | Medium (2 sessions) | ✅ Now |
| D2 | AI Decision Audit Trail | Nothing | Medium (2 sessions) | ✅ Now |
| D5 | Accuracy Scorecard | D2 complete | Medium (2 sessions) | After D2 |

---

*Generated from: `docs/demo-ideas/2026-03-20.md` · Feature Radar 2026-03-20*
