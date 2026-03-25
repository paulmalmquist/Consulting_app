# MEGA META PROMPT — Competitor Feature Reversal Roadmap
## Winston / Novendor · March 18, 2026

This prompt is the canonical build directive derived from the March 18 2026 competitive scan of REPE + Construction/PDS competitors. Every feature item below was observed as a live shipping feature in a competitor as of this date. For each, the repo has been audited for existing capability. The intent is NOT to copy competitors — it is to out-execute them using Winston's existing architecture and domain depth.

Execute these prompts in dependency order. Each prompt is independently completable. Do not begin a downstream prompt until its prerequisite is verified deployed.

---

## REPO SAFETY CONTRACT — READ FIRST (applies to all prompts below)

All work extends the existing architecture. Do not:
- Modify existing table PKs, FKs, constraints, or calculation logic
- Change existing API response shapes
- Modify `re_waterfall_*.py`, `re_irr_timeline.py`, `re_scenario*.py`, or `re_fund_metrics.py` logic
- Break the quarterly rollup chain: `re_asset_quarter_state` → `re_jv_quarter_state` → `re_investment_quarter_state` → `re_fund_quarter_state`
- Rename or delete Meridian demo assets (see `MEGA_META_PROMPT_CONSTRUCTION_DEV.md`)

All new tables are additive. All new routes use new prefixes. All new services extend existing ones — do not replace them.

---

## CAPABILITY AUDIT SUMMARY (as of 2026-03-18)

### What Winston already has (do not rebuild)
- **Scenario engine**: `re_scenario.py`, `re_scenario_engine.py`, `re_scenario_engine_v2.py`, `re_scenario_templates.py`, `re_model_scenario.py` — full multi-scenario framework with overrides and assumptions
- **Construction finance**: `finance_construction.py`, `fin_construction_project`, `fin_budget*`, `fin_change_order_version`, `fin_contract_commitment` — CSI-division cost tracking, change orders, commitments
- **PDS analytics layer**: `pds_analytics_projects`, `pds_advanced_analytics.py`, `pds_engines.py`, `pds_executive/`, `pds_revenue_analytics.py` — full analytics stack
- **Deal pipeline**: `re_pipeline.py`, `re_pipeline_vector.py`, `cro_pipeline.py` — vectorized deal pipeline with scoring
- **Document intelligence**: `pdf_processing.py`, `text_extractor.py`, `extraction.py`, `extraction_profiles.py` — PDF extraction and profiles
- **RAG/reranking**: `rag_indexer.py`, `rag_reranker.py`, `psychrag*.py` — full RAG stack with reranking
- **Fund metrics + waterfall**: `re_fund_metrics.py`, `re_waterfall_runtime.py`, `re_waterfall_scenario.py` — IRR, TVPI, DPI, waterfall
- **Monte Carlo**: `re_monte_carlo.py`, `re_model_monte_carlo.py` — probabilistic scenario engine
- **Debt surveillance**: `re_debt_surveillance.py`, `re_loan*.py` — loan covenant tracking
- **Sustainability**: `re_sustainability*.py` — ESG/sustainability reporting
- **Capital projects**: `capital_projects.py` (routes + services) — capital project tracking
- **AI gateway + assistant**: `ai_gateway.py`, `nv_ai_copilot.py`, `assistant_blocks.py` — full Winston copilot

### What Winston is missing (build targets from this prompt)
1. Side-by-side scenario comparison UI (ARGUS parity)
2. Operational AI agents for RFI, submittal, and reconciliation workflows (Yardi/Procore parity)
3. Deal intake AI pipeline with OM auto-extraction (Dealpath parity)
4. LP intelligence layer — investor CRM with AI summaries (Juniper parity)
5. Construction IQ — predictive risk scoring across RFIs, submittals, inspections (Procore/Autodesk parity)
6. Drawing/document comparison and scope gap detection (Bluebeam parity)
7. PDS predictive delay + cost-at-completion intelligence (INGENIOUS.BUILD parity)
8. Spec intelligence — natural language queries against construction specs (Autodesk ACC parity)
9. Submittal log automation from specification documents (Autodesk AutoSpecs parity)
10. Agentic month-end reconciliation workflow (Yardi Virtuoso parity)

---

## PHASE 1: SCENARIO ENGINE UI UPGRADE
*Unblocked. Build on existing `re_scenario_engine_v2.py` and scenario tables.*

### Competitor signal
ARGUS Intelligence (March 2026) shipped portfolio-level scenario simulation with side-by-side comparison of up to 5 scenarios, PDF/JPG export, and a centralized Model Management hub.

### Build prompt

You are extending the Winston REPE workspace scenario interface. The backend scenario engine (`re_scenario_engine_v2.py`, `re_model_scenario.py`, `re_scenario_templates.py`) already exists and is stable. Your job is to build a premium **Scenario Comparison Workbench** UI that sits inside `/app/lab/env/[envId]/re/scenarios/compare`.

**Backend additions (additive only):**
1. Add `GET /api/v1/re/scenarios/compare` endpoint in a new `re_scenarios_compare.py` router. Accept `scenario_ids[]` (up to 5) and `asset_id` or `fund_id`. Return a unified comparison payload: `{ scenarios: [{ id, name, assumptions, outputs: { irr, tvpi, equity_multiple, noi, exit_value, cash_flows } }] }`.
2. Add `POST /api/v1/re/scenarios/compare/export` that generates a clean PDF summary of the comparison (use `investor_statement_pdf.py` patterns for PDF generation — do not write a new PDF engine).

**Frontend additions:**
1. New page `repo-b/src/app/lab/env/[envId]/re/scenarios/compare/page.tsx`:
   - Scenario selector (multi-select up to 5, showing scenario name + base/stress/bull labels)
   - Side-by-side metric cards for: IRR, TVPI, Equity Multiple, Exit Value, NOI — color-coded green/yellow/red vs. base case
   - Stacked bar chart: cash flow comparison across scenarios over hold period
   - "Model Management" panel listing all scenarios across the fund with active/inactive toggle
   - Export button → calls `/compare/export` → downloads PDF
2. New nav item "Compare" under the Scenarios section of the REPE sidebar.
3. Connect to existing `ReEnvProvider` and `bos-api.ts` — add `getScenarioComparison(envId, scenarioIds)` and `exportScenarioComparison(envId, scenarioIds)` to `bos-api.ts`.

**Verification:**
- Load Meridian demo → navigate to Scenarios → Compare
- Select 3 scenarios → confirm side-by-side metrics render correctly
- Export PDF → confirm it downloads and shows comparison table

---

## PHASE 2: DEAL INTAKE AI PIPELINE
*Unblocked. Build on existing `pdf_processing.py`, `extraction.py`, `re_pipeline.py`.*

### Competitor signal
Dealpath AI Studio (live Oct 2025): OM data abstraction in under 1 minute, automatic deal record population, comparable identification by price/proximity/criteria. CBRE + JLL broker integrations.

### Build prompt

You are extending Winston's deal pipeline with an **AI-powered deal intake pipeline**. The goal: a PM drops an OM PDF, and within 60 seconds Winston has populated a deal record with extracted fields, run comps, and staged it for review.

**Backend additions:**
1. New service `backend/app/services/re_deal_intake.py`:
   - `async def ingest_om(file_bytes: bytes, file_name: str, env_id: str) -> DealIntakeResult`
   - Uses `pdf_processing.py` to extract text, then calls `extraction.py` with a new `ExtractionProfile` named `"om_deal_intake"` (add this profile to `extraction_profiles.py`)
   - The `om_deal_intake` profile targets: property_name, address, asset_class, total_units_or_sf, asking_price, noi, cap_rate, occupancy, year_built, hold_period, pro_forma_irr, key_risks (list), sponsor_name, key_tenants (list)
   - After extraction, calls `re_pipeline.py::create_draft_deal_record()` (extend this service — do not duplicate pipeline logic) with `source: "ai_intake"` and `confidence_scores: {}` per field
   - Also calls `re_property_comps.py` to auto-populate comps within 10 miles and same asset class

2. New route `POST /api/v1/re/deals/intake/upload` in `re_pipeline.py` router — accepts multipart file upload, returns `DealIntakeResult` with extracted fields + confidence scores + comps

3. New schema `DealIntakeResult`: `{ deal_id, extracted_fields: {name: str, value: any, confidence: float}, comps: [{address, sale_price, cap_rate, date}], processing_ms: int }`

**Frontend additions:**
1. New modal `repo-b/src/components/repe/DealIntakeModal.tsx`:
   - Drop zone for OM PDF
   - Progress indicator: "Extracting → Scoring → Finding comps" (3 steps, animated)
   - Results panel: extracted fields table with confidence color-coding (green ≥ 0.8, yellow 0.5–0.8, red < 0.5)
   - Comps table: address, sale price, cap rate, date
   - "Accept & Create Deal" button → POSTs to create confirmed deal record
   - "Edit before saving" option → opens deal form pre-populated with extracted values

2. Add "Import OM" button to the REPE pipeline page (`/app/lab/env/[envId]/re/pipeline`) that triggers this modal.

**Verification:**
- Upload any sample OM PDF → confirm extraction completes in <30s in dev
- Confirm extracted fields populate the deal form correctly
- Confirm comps appear in the modal

---

## PHASE 3: AGENTIC RECONCILIATION WORKFLOW
*Depends on Phase 1 complete. Builds on `re_reconciliation.py`, `re_quarter_close.py`, `ai_gateway.py`.*

### Competitor signal
Yardi Virtuoso AI Agents (live Q4 2025): automated month-end book balancing reported to cut close time from 20+ hours to <5 hours. Agents handle AP routing, invoice matching, and reconciliation.

### Build prompt

You are building Winston's **Agentic Month-End Close Workflow**. This is a step-by-step guided AI workflow — not a fire-and-forget agent — that walks a user through reconciliation tasks with Winston completing the heavy lifting at each step and pausing for human approval before advancing.

**Backend additions:**
1. New service `backend/app/services/re_close_agent.py`:
   - `CloseWorkflow` class with states: `[not_started, gathering_actuals, reconciling_gl, flagging_exceptions, awaiting_review, posting_entries, complete]`
   - `async def start_close(fund_id, period) -> CloseWorkflowResult` — kicks off the workflow, calls `re_quarter_close.py` for existing close logic
   - `async def get_exceptions(fund_id, period) -> List[CloseException]` — surfaces variance items > threshold (configurable, default $10k or >2%)
   - `async def draft_journal_entry(exception_id) -> JournalEntryDraft` — uses AI gateway to draft the correcting journal entry in natural language with debit/credit legs
   - `async def approve_and_post(workflow_id, approved_entries: List[str]) -> CloseResult`

2. New route group `POST /api/v1/re/close/start`, `GET /api/v1/re/close/{workflow_id}/status`, `GET /api/v1/re/close/{workflow_id}/exceptions`, `POST /api/v1/re/close/{workflow_id}/approve`

3. Store workflow state in a new table `re_close_workflow` (additive schema): `{ id, fund_id, period, state, started_at, completed_at, exceptions_count, approvals_count, env_id }`

**Frontend additions:**
1. New page `repo-b/src/app/lab/env/[envId]/re/close/page.tsx` — "Close Workspace":
   - Timeline stepper showing current workflow state
   - Exceptions table: account, GL balance, expected balance, variance, severity badge
   - Per-exception: "Review" → shows Winston's AI-drafted explanation and proposed journal entry
   - "Approve" / "Override" / "Escalate" actions per exception
   - Progress counter: "12 of 14 exceptions resolved"
   - "Finalize Close" CTA — only enabled when all exceptions are approved or overridden

2. Add "Close" item to REPE sidebar navigation under the Fund section.

**Verification:**
- Open Close Workspace for Meridian → confirm workflow initializes
- Confirm exceptions surface with AI-drafted explanations
- Approve 2 exceptions → confirm state advances

---

## PHASE 4: LP INTELLIGENCE LAYER
*Unblocked. Builds on `crm.py`, `cro_strategic_outreach.py`, `ai_gateway.py`.*

### Competitor signal
Juniper Square (Oct 2025 + Jan 2026): AI CRM for private markets IR with natural language queries, automated investor activity alerts, Nasdaq eVestment integration for institutional investor discovery, LP onboarding with centralized question management, and auto-sync to Investran.

### Build prompt

You are adding an **LP Intelligence Module** to Winston's CRM. The goal: Winston surfaces the right LP to call, writes the LP update, flags which LPs are cold, and answers questions about LP sentiment and commitment history.

**Backend additions:**
1. New service `backend/app/services/lp_intelligence.py`:
   - `async def get_lp_health_scores(fund_id) -> List[LPScore]` — scores each LP on: days since last contact, unreturned emails (from `crm.py` interactions), commitment fulfillment rate, re-up probability
   - `async def draft_lp_update(fund_id, period, lp_id=None) -> str` — uses AI gateway to draft a natural language LP update letter for a specific LP or generic fund update
   - `async def answer_lp_question(fund_id, question: str) -> str` — RAG-powered Q&A against LP docs, K-1s, side letters using `psychrag_rag.py`
   - `async def identify_cold_lps(fund_id, days_threshold=90) -> List[LP]` — returns LPs with no engagement > threshold
   - `async def suggest_outreach(lp_id) -> OutreachSuggestion` — references `cro_strategic_outreach.py` for outreach sequencing

2. New route group `GET /api/v1/re/lp/health`, `POST /api/v1/re/lp/update/draft`, `POST /api/v1/re/lp/qa`, `GET /api/v1/re/lp/cold` — all scoped to `fund_id` query param

**Frontend additions:**
1. New page `repo-b/src/app/lab/env/[envId]/re/lp/page.tsx` — "LP Intelligence":
   - LP roster table with health score badges (Engaged / Warm / Cold / At-Risk)
   - "Draft Fund Update" button → Winston generates LP letter (copy to clipboard or download .docx)
   - Per-LP drawer: commitment history, last contact, re-up probability gauge, AI-suggested next action
   - "Ask Winston about LPs" search bar → free-text Q&A (e.g., "Which LPs have outstanding K-1 questions?")

2. Add "LPs" item to REPE sidebar.

**Verification:**
- Load Meridian LP view → confirm health scores render for seeded LPs
- Draft a fund update → confirm letter generates in <10s
- Ask "which LPs haven't been contacted this quarter?" → confirm RAG response

---

## PHASE 5: CONSTRUCTION RISK INTELLIGENCE (Construction IQ)
*Depends on existing PDS schema and `finance_construction.py`. Unblocked.*

### Competitor signal
Procore Helix + Autodesk Construction IQ (2025–2026): AI layers that analyze RFIs, submittals, inspections, and observations to identify and prioritize risks across quality, safety, schedule, and budget. Procore also launched AI-powered Safety Hub with unified risk views.

### Build prompt

You are building **Winston Construction IQ** — a risk intelligence layer on top of Winston's PDS and construction finance data. This is not a new data model — it reads existing PDS and construction data and produces risk scores and actionable alerts.

**Backend additions:**
1. New service `backend/app/services/construction_iq.py`:
   - `async def score_project_risk(project_id) -> ProjectRiskScore` — composite risk score across: budget variance risk, schedule slip risk, RFI backlog risk, submittal lag risk, change order velocity risk
   - Each sub-score: `{ category, score: float 0-1, trend: up/flat/down, top_drivers: List[str], recommended_action: str }`
   - `async def get_risk_alerts(env_id, severity: str = "high") -> List[RiskAlert]` — portfolio-level alert feed
   - `async def analyze_rfi_backlog(project_id) -> RFIAnalysis` — count, avg age, % overdue, top categories (uses `pds_advanced_analytics.py` patterns)
   - `async def predict_schedule_slip(project_id) -> SchedulePrediction` — uses linear regression on historical `pds_analytics_projects` milestones to forecast completion date vs. baseline

2. New route group `GET /api/v1/pds/construction-iq/projects/{project_id}/risk`, `GET /api/v1/pds/construction-iq/alerts`, `GET /api/v1/pds/construction-iq/projects/{project_id}/rfi-analysis`, `GET /api/v1/pds/construction-iq/projects/{project_id}/schedule-prediction`

**Frontend additions:**
1. New component `repo-b/src/components/pds/ConstructionIQPanel.tsx`:
   - Risk dial for each category (budget/schedule/RFI/submittal/change order) — circular gauge with score 0-100
   - Trend arrow + change vs. last period
   - "Top drivers" callout: 2-3 bullet sentences from the score service
   - Recommended action in a Winston-styled callout box

2. Embed `ConstructionIQPanel` into the existing PDS project detail page.
3. New Portfolio Risk Feed page `repo-b/src/app/lab/env/[envId]/pds/risk/page.tsx` — ranked list of all projects by composite risk score, filterable by category.

**Verification:**
- Open a PDS project → confirm risk dials render with scores
- Open Portfolio Risk Feed → confirm projects are ranked by risk
- Verify schedule prediction shows days ahead/behind baseline

---

## PHASE 6: SPEC INTELLIGENCE + SUBMITTAL LOG AUTOMATION
*Unblocked. Builds on existing RAG stack (`psychrag_rag.py`, `pdf_processing.py`) and PDS tables.*

### Competitor signal
Autodesk ACC AutoSpecs (live 2025): automatically generates submittal logs from specification documents in minutes. Autodesk Assistant answers natural language questions about spec books (e.g., "What's the required drywall thickness?"). OCR-based title block extraction for document metadata.

### Build prompt

You are building **Winston Spec Intelligence** — two capabilities in one:
1. Upload a spec book (PDF) → Winston auto-generates a submittal log
2. Ask natural language questions about the spec

**Backend additions:**
1. New service `backend/app/services/spec_intelligence.py`:
   - `async def ingest_spec_book(file_bytes, project_id, file_name) -> SpecIngestionResult` — chunks spec PDF by CSI section using `pdf_processing.py`, indexes each section via `rag_indexer.py` with metadata `{ project_id, csi_division, section_number, section_title }`
   - `async def generate_submittal_log(project_id) -> List[SubmittalLogEntry]` — queries the indexed spec to extract all sections requiring submittals, returns structured list: `{ section, submittal_type, required_by, responsible_party_placeholder }`
   - `async def answer_spec_question(project_id, question: str) -> SpecAnswer` — RAG query against spec index for this project, returns answer + source section + confidence
   - `async def extract_title_block(file_bytes) -> TitleBlockMetadata` — OCR-based extraction of drawing number, revision, date, title, discipline from PDF title blocks

2. New routes: `POST /api/v1/pds/specs/ingest`, `GET /api/v1/pds/specs/{project_id}/submittal-log`, `POST /api/v1/pds/specs/{project_id}/ask`, `POST /api/v1/pds/specs/title-block`

3. New table `pds_spec_sections` (additive): `{ id, project_id, csi_division, section_number, section_title, requires_submittal, indexed_at }`

**Frontend additions:**
1. New page `repo-b/src/app/lab/env/[envId]/pds/specs/page.tsx` — "Spec Intelligence":
   - Upload zone for spec books (PDF)
   - Progress bar showing ingestion status: "Parsing → Chunking by CSI division → Indexing"
   - "Generated Submittal Log" table: section, submittal type, required by, responsible party — exportable to Excel
   - "Ask about specs" chat widget (uses existing `CopilotChat` component patterns, scoped to spec index)

2. Add title block extraction as a drag-drop zone in the PDS document manager.

**Verification:**
- Upload a multi-section spec PDF → confirm submittal log generates with CSI divisions
- Ask "What are the concrete testing requirements?" → confirm answer cites correct section
- Upload drawing PDF → confirm title block fields extract correctly

---

## PHASE 7: DOCUMENT COMPARISON + SCOPE GAP DETECTION
*Depends on Phase 6 (spec index). Unblocked for the comparison core.*

### Competitor signal
Bluebeam Max (launching early 2026): AI-REVIEW and AI-MATCH (from Firmus AI acquisition) — uncover design issues, detect scope gaps, compare drawings with AI. Natural language prompts to automate markup tasks.

### Build prompt

You are building **Winston Document Diff** — the ability to compare two versions of a construction document (drawings, specs, contracts) and surface scope gaps, revision changes, and risk items.

**Backend additions:**
1. New service `backend/app/services/document_diff.py`:
   - `async def compare_documents(doc_a_bytes, doc_b_bytes, doc_type: str) -> DocumentDiffResult` — extracts text from both docs, runs a structured diff, uses AI gateway to classify each change as: `scope_addition | scope_removal | spec_change | risk_item | administrative`
   - `async def detect_scope_gaps(spec_bytes, drawing_bytes) -> List[ScopeGap]` — cross-references spec sections against drawing notes to find items called out in spec but not reflected in drawings (and vice versa)
   - `async def summarize_revision(doc_a_bytes, doc_b_bytes) -> RevisionSummary` — free-text AI summary of what changed between two document versions

2. New routes: `POST /api/v1/pds/documents/compare`, `POST /api/v1/pds/documents/scope-gaps`, `POST /api/v1/pds/documents/revision-summary`

**Frontend additions:**
1. New component `repo-b/src/components/pds/DocumentDiffViewer.tsx`:
   - Two-panel layout: "Document A" / "Document B" (drag-drop or select from project documents)
   - Change type filter chips: Scope Addition / Scope Removal / Risk Items / Admin
   - Change list: each item shows: type badge, excerpt from doc_a vs doc_b, AI classification reason
   - "Scope Gaps" tab — table showing mismatches between spec and drawings
   - "Export Diff Report" → generates PDF of all changes with Winston summary at top

2. Accessible from PDS project document manager as "Compare Versions" action.

**Verification:**
- Upload two versions of same drawing → confirm changes list with classifications
- Upload spec + drawing → confirm scope gap table populates
- Export PDF → confirm it renders correctly

---

## PHASE 8: PDS PREDICTIVE ANALYTICS (COST AT COMPLETION + DELAY PREDICTION)
*Depends on existing `pds_advanced_analytics.py` and `pds_engines.py`.*

### Competitor signal
JLL INGENIOUS.BUILD (2025–2026 deployment): predictive project insights — cost accuracy improvement of 20%, project cost reduction of 15% through AI-driven predictions. PROBIS integration for financial management with cash flow forecasting.

### Build prompt

You are extending Winston PDS analytics with **predictive intelligence** — cost-at-completion (EAC) forecasting and delay probability scoring for every active project.

**Backend additions (extend `pds_advanced_analytics.py` — do not replace):**
1. New function `async def calculate_eac(project_id) -> EACResult`:
   - `EACResult`: `{ budget_at_completion, actual_cost_to_date, estimate_to_complete, estimate_at_completion, variance_at_completion, cost_performance_index, schedule_performance_index, confidence_interval_95: [low, high] }`
   - CPI = BCWP / ACWP (Earned Value Management formula)
   - EAC = BAC / CPI (performance-based forecast)
   - Confidence interval: ± 15% at 95% (adjustable per project risk score from Phase 5)

2. New function `async def predict_completion_date(project_id) -> CompletionPrediction`:
   - Uses schedule performance data from `pds_analytics_projects`
   - Returns: `{ baseline_completion, predicted_completion, days_variance, delay_probability: float, delay_drivers: List[str] }`

3. New function `async def get_portfolio_cash_flow_forecast(env_id, periods: int = 12) -> List[CashFlowPeriod]`:
   - Rolls up EAC across all active projects
   - Returns monthly cash flow forecast with committed spend, forecasted spend, and variance

4. New routes: `GET /api/v1/pds/analytics/projects/{project_id}/eac`, `GET /api/v1/pds/analytics/projects/{project_id}/completion-prediction`, `GET /api/v1/pds/analytics/portfolio/cash-flow-forecast`

**Frontend additions:**
1. New widget `EACGauge` — circular gauge showing EAC vs. BAC with performance color (green < 5% over, yellow 5–15%, red > 15%)
2. New widget `DelayProbabilityBadge` — percentage + days variance + trend arrow
3. New page `repo-b/src/app/lab/env/[envId]/pds/forecast/page.tsx` — "Portfolio Forecast":
   - Bar chart: monthly cash flow forecast (committed vs. forecasted vs. actual) — 12-month horizon
   - Project table with EAC, delay probability, and CPI for all active projects
   - Sortable by risk, cost overrun, delay probability
   - Click → drill into project EAC detail

4. Embed EAC + delay widgets into PDS project header/summary card.

**Verification:**
- Open PDS project → confirm EAC and delay probability render
- Open Portfolio Forecast → confirm 12-month cash flow chart renders with all active projects
- Verify EAC calculation matches BAC / CPI formula manually for one project

---

## PHASE 9: AGENTIC RFI + SUBMITTAL AGENTS
*Depends on Phase 6 (spec index built). Builds on `ai_gateway.py`, `nv_ai_copilot.py`.*

### Competitor signal
Procore AI Agents (live 2025–2026): RFI Creation Agent generates RFI content and searches project documents for answers. Agent Builder in open beta — teams can create agents from natural language descriptions. Agents handle RFIs, scheduling, submittals.

### Build prompt

You are building Winston's **Construction Agents** — two purpose-built AI agents:
1. **RFI Agent**: given a question or field issue, drafts a complete RFI by searching specs + drawings
2. **Submittal Agent**: tracks submittal log, identifies overdue items, and drafts submittal cover letters

**Backend additions:**
1. New service `backend/app/services/construction_agents.py`:
   - `async def draft_rfi(project_id, question: str, context: str = "") -> RFIDraft`:
     - Searches spec index (Phase 6) for relevant sections
     - Searches project documents via `psychrag_rag.py`
     - Returns: `{ rfi_number_suggestion, subject, description, spec_references, drawing_references, question_for_architect, urgency_assessment }`
   - `async def analyze_submittal_status(project_id) -> SubmittalStatusReport`:
     - Cross-references generated submittal log (Phase 6) against actual submitted items in PDS
     - Returns: overdue count, upcoming due dates, missing submittals, average review cycle time
   - `async def draft_submittal_cover(project_id, submittal_id, contractor_name: str) -> str`:
     - AI-generated cover letter for submittal package

2. New routes: `POST /api/v1/pds/agents/rfi/draft`, `GET /api/v1/pds/agents/submittals/status`, `POST /api/v1/pds/agents/submittals/cover-letter`

**Frontend additions:**
1. New "Agent Actions" command palette in PDS project view (floating button, Cmd+K style):
   - "Draft RFI" → opens panel with question input → streams RFI draft
   - "Check Submittal Status" → shows overdue/upcoming table
   - "Draft Submittal Cover Letter" → select submittal → generates letter
2. RFI draft viewer with "Copy to clipboard" and "Save as RFI record" actions

**Verification:**
- Type a field question → confirm RFI draft generates with spec references in <15s
- Open submittal status → confirm overdue items appear correctly
- Generate cover letter → confirm it references project name, submittal number, contractor

---

## PHASE 10: WINSTON AGENTIC OPERATIONS AUTOMATION (Capstone)
*Depends on all prior phases. This is the capstone that ties the agents into a coherent Winston command surface.*

### Competitor signal
Yardi Virtuoso Marketplace + Composer (live 2025): customizable AI agents distributed via a marketplace. Agents built with natural language via "Virtuoso Composer." Autodesk ACC → Forma (March 2026): unified platform convergence. Procore Agent Builder in open beta.

### Build prompt

You are building the **Winston Agent Command Surface** — a unified interface where REPE and construction users can discover, invoke, and chain the agents built in Phases 3, 4, 5, 9 (and future agents) without navigating to different pages.

**This is a UI/UX composition task, not new backend work. All backend agents already exist from prior phases.**

1. New component `repo-b/src/components/winston/AgentLauncher.tsx`:
   - Floating action panel accessible from any Lab environment page (not just PDS or REPE)
   - Agent cards: Close Workflow, Deal Intake, LP Intelligence, RFI Draft, Submittal Status, Spec Search, Document Compare
   - Each card: icon, agent name, 1-sentence description, estimated run time
   - Click → launches agent modal inline without navigation
   - "Recently Run" section showing last 5 agent invocations with status

2. New table `winston_agent_invocations` (additive): `{ id, env_id, user_id, agent_name, input_summary, status, started_at, completed_at, output_url }` — used for "Recently Run" history

3. Update Winston copilot (`nv_ai_copilot.py` route, `CopilotChat` component) to recognize agent intents from natural language:
   - "draft an RFI about the structural opening at axis B-4" → launches RFI Agent with question pre-filled
   - "start the month-end close" → launches Close Workflow
   - "who are our coldest LPs?" → launches LP Intelligence
   - (Add these intent patterns to existing intent router — do not replace existing intents)

4. Global agent status indicator in the Lab shell header — shows running agent count + last completion

**Verification:**
- Open any Lab environment → confirm Agent Launcher is visible
- Click "Deal Intake" → confirm OM upload modal launches
- Type "draft an RFI" in Winston copilot → confirm RFI Agent launches
- Confirm agent history table populates after running 2 agents

---

## ORDERING AND DEPENDENCIES

```
Phase 1 (Scenario Compare UI)         → No dependencies
Phase 2 (Deal Intake AI)              → No dependencies
Phase 3 (Close Agent)                 → Phase 1 complete
Phase 4 (LP Intelligence)             → No dependencies
Phase 5 (Construction IQ)             → No dependencies
Phase 6 (Spec Intelligence)           → No dependencies
Phase 7 (Document Compare)            → Phase 6 complete
Phase 8 (PDS Predictive Analytics)    → No dependencies
Phase 9 (RFI + Submittal Agents)      → Phase 6 complete
Phase 10 (Agent Command Surface)      → Phases 2, 3, 4, 5, 9 complete
```

**Suggested sprint order:**
- Sprint 1: Phases 1, 2, 4, 5 (all unblocked, highest competitive signal)
- Sprint 2: Phase 6, 8 (spec indexing + predictive analytics)
- Sprint 3: Phases 3, 7, 9 (depend on Sprint 2)
- Sprint 4: Phase 10 (capstone)

---

## POSITIONING NOTES FOR EACH PHASE

| Phase | Competitor Being Beaten | Winston's Edge Over Competitor |
|---|---|---|
| 1 — Scenario Compare | ARGUS Intelligence | Conversational refinement + no ARGUS file dependency |
| 2 — Deal Intake | Dealpath AI Studio | Produces IC memo context, not just structured fields |
| 3 — Close Agent | Yardi Virtuoso | Works across multi-platform stacks, not just Yardi data |
| 4 — LP Intelligence | Juniper Square | GP-side reasoning + fund analytics context; not just IR CRM |
| 5 — Construction IQ | Procore Helix / Autodesk CIQ | Cross-domain risk (budget + schedule + RFI in one score) |
| 6 — Spec Intelligence | Autodesk AutoSpecs | Full RAG Q&A on specs, not just submittal log generation |
| 7 — Document Compare | Bluebeam Max | Scope gap detection cross-referencing spec vs. drawing |
| 8 — PDS Predictive | INGENIOUS.BUILD / PROBIS | Unified with REPE capital stack — construction → fund P&L |
| 9 — RFI + Submittal Agents | Procore AI Agents | Reads your actual spec index, not generic construction knowledge |
| 10 — Agent Surface | Yardi Virtuoso Marketplace | No marketplace needed — agents live inside Winston context |

---

*Generated: 2026-03-18 from competitive scan of Yardi, Juniper Square, Cherre, Altus/ARGUS, Dealpath, Procore, Autodesk ACC/Forma, Bluebeam, INGENIOUS.BUILD, JLL PDS/PROBIS*
