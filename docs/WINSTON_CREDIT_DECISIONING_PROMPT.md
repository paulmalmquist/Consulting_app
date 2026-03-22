---
id: winston-credit-decisioning-prompt
kind: prompt
status: active
source_of_truth: true
topic: credit-decisioning-environment
owners:
  - docs
  - backend
  - repo-b
intent_tags:
  - credit
  - decisioning
  - build
  - walled-garden
triggers:
  - credit decisioning environment
  - credit workspace build
  - walled garden implementation
  - consumer credit AI
  - decisioning engine
entrypoint: true
handoff_to:
  - feature-dev
  - data-winston
  - credit-decisioning
when_to_use: "Use when the user explicitly asks for the Winston credit decisioning implementation prompt, the consumer credit environment build spec, or needs to understand how the three-layer architecture (walled garden, chain-of-thought, format locks) maps to actual Winston infrastructure."
when_not_to_use: "Do not use as the general router; CLAUDE.md handles routing. Do not use for REPE-specific work."
surface_paths:
  - docs/
  - backend/
  - repo-b/
  - .skills/credit-decisioning/
---

# Winston — Consumer Credit Decisioning Environment: Full Implementation Prompt

> **Scope:** This prompt builds the consumer credit decisioning environment inside Winston, matching the sophistication of the existing REPE environment. The architecture implements three layers documented in `The Underwriting Standard for AI`: (1) Deny-by-Default Walled Garden, (2) Chain-of-Thought Orchestration, (3) Format Locks. The operational contract for AI behavior is in `.skills/credit-decisioning/SKILL.md`. This prompt covers the infrastructure: schema, backend services, MCP tools, system prompt, frontend pages, and context wiring.
>
> Every file reference below is real. Do not rename files or change module boundaries.

---

## Role

You are a senior full-stack engineer working inside this monorepo. The REPE environment is fully operational with scope-resolved tool calls, streaming SSE events, and an AdvancedDrawer debug panel. Your task is to build the credit decisioning environment to the same level of operational maturity. This is not a copy-paste of REPE. It is a parallel domain surface with its own data model, its own tool set, its own system prompt extensions, and three additional architectural constraints (walled garden, chain-of-thought, format locks) that REPE does not have.

---

## Current State

### What exists today

| Layer | File | Status |
|-------|------|--------|
| Schema: origination lifecycle | `repo-b/db/schema/274_credit_core.sql` | Deployed. 8 tables: cases, underwriting versions, committee decisions, facilities, covenants, monitoring events, watchlist, workout. |
| Schema: object model | `repo-b/db/schema/275_credit_object_model.sql` | Written. 6 tables: `cc_portfolio`, `cc_borrower`, `cc_loan`, `cc_loan_event`, `cc_servicer_entity`, `cc_portfolio_servicer_link`. |
| Schema: workflow + audit | `repo-b/db/schema/277_credit_workflow.sql` | Written. 7 tables: `cc_corpus_document`, `cc_corpus_passage`, `cc_decision_policy`, `cc_decision_log`, `cc_exception_queue`, `cc_portfolio_scenario`, `cc_audit_record`. |
| Backend: origination CRUD | `backend/app/services/credit.py` | Deployed. Case lifecycle, underwriting, committee, covenants, watchlist, workout. |
| Backend: decisioning engine | `backend/app/services/credit_decisioning.py` | Written. `evaluate_loan()`, corpus operations, audit records, format lock validation. |
| Backend: API routes | `backend/app/routes/credit.py` | Deployed. `/api/credit/v1` — case-level CRUD + seed. |
| Skill: AI behavior contract | `.skills/credit-decisioning/SKILL.md` | Written. Three-layer enforcement, banned patterns, output schemas, examiner test. |
| Frontend: credit hub | `repo-b/src/app/lab/env/[envId]/credit/page.tsx` | Deployed. Case list with 4-metric KPI strip. |
| Frontend: case workspace | `repo-b/src/app/lab/env/[envId]/credit/cases/[caseId]/page.tsx` | Deployed. 6-tab scaffold (Overview, Underwriting, Committee, Covenants, Watchlist, Workout). |
| Demo: interactive HTML | `Credit_Decisioning_Environment.html` | Written. Self-contained demo of all three layers. |

### What is missing

| Gap | Impact | REPE Equivalent |
|-----|--------|-----------------|
| Schema 275 + 277 not migrated | No portfolio, loan, decisioning, or audit tables in database | 265 + 267 deployed |
| No MCP credit tools registered | Winston cannot read or write credit data | `repe_tools.py` fully registered |
| No credit system prompt block | Winston does not know about credit domain or three-layer constraints | `_SYSTEM_PROMPT_BASE` covers REPE |
| No credit scope resolution | Context envelope does not resolve credit entities | `assistant_scope.py` resolves REPE |
| No credit router patterns | Write requests to credit go nowhere | `request_router.py` routes REPE writes |
| No `/api/credit/v2` routes | No portfolio, loan, decisioning, exception, forecast, or audit endpoints | `/api/repe/` fully built |
| No credit frontend pages beyond origination | No portfolio list, loan browser, decisioning page, exception queue, performance dashboard, forecast page, or attribute page | 15+ REPE pages |
| No credit seeder | No demo data for portfolios, loans, policies, decisions, or audit records | REPE seeder creates funds, deals, assets |
| No credit context publisher | Frontend does not inject credit entities into `window.__APP_CONTEXT__` | REPE pages publish funds, investments, assets |
| No E2E tests | No test coverage for credit workspace | `repe-journey.spec.ts`, `repe-workspace.spec.ts` |

---

## Part 1 — Database Migrations

### 1a. Deploy 275_credit_object_model.sql

Run as a Supabase migration. Creates: `cc_portfolio`, `cc_borrower`, `cc_loan`, `cc_loan_event`, `cc_servicer_entity`, `cc_portfolio_servicer_link`.

Add `credit_initialized` column to `app.environments` (parallel to `repe_initialized`):

```sql
ALTER TABLE app.environments ADD COLUMN IF NOT EXISTS credit_initialized boolean NOT NULL DEFAULT false;
```

### 1b. Deploy 277_credit_workflow.sql

Run as a Supabase migration. Creates: `cc_corpus_document`, `cc_corpus_passage`, `cc_decision_policy`, `cc_decision_log`, `cc_exception_queue`, `cc_portfolio_scenario`, `cc_audit_record`.

Key constraints:
- `cc_decision_log` is append-only. No `updated_at`, no `updated_by`. Once written, a decision log row is immutable.
- `cc_audit_record` is append-only. Same constraint.
- `cc_decision_policy` has a partial unique index: one active policy per portfolio per type.
- `cc_portfolio_scenario` has a partial unique index: one base scenario per portfolio.

---

## Part 2 — Backend: Credit v2 Routes

### File: `backend/app/routes/credit_v2.py` (new)

Register at `/api/credit/v2` in `backend/app/main.py`.

Endpoint surface:

| Method | Path | Service Function | Notes |
|--------|------|-----------------|-------|
| `GET` | `/context` | `credit_decisioning.resolve_credit_context()` | Returns env/business binding, credit_initialized status |
| `POST` | `/context/init` | `credit_decisioning.init_credit_context()` | Sets credit_initialized, creates default corpus |
| `GET` | `/portfolios` | `credit_decisioning.list_portfolios()` | With loan_count, total_upb rollups |
| `POST` | `/portfolios` | `credit_decisioning.create_portfolio()` | |
| `GET` | `/portfolios/{id}` | `credit_decisioning.get_portfolio()` | |
| `PATCH` | `/portfolios/{id}` | `credit_decisioning.update_portfolio()` | |
| `GET` | `/portfolios/{id}/loans` | List loans in portfolio | Filterable by status, grade, vintage |
| `POST` | `/portfolios/{id}/loans` | Create loan | Single loan creation |
| `POST` | `/portfolios/{id}/loans/import` | Bulk import | CSV tape upload |
| `GET` | `/loans/{id}` | Loan detail | With borrower and event timeline |
| `GET` | `/loans/{id}/events` | Loan event timeline | |
| `POST` | `/loans/{id}/events` | Record event | Payment, delinquency, cure, etc. |
| `GET` | `/portfolios/{id}/policies` | List decision policies | |
| `POST` | `/portfolios/{id}/policies` | Create policy | With rules_json |
| `PATCH` | `/policies/{id}/activate` | Activate policy | Deactivates prior active |
| `POST` | `/loans/{id}/decide` | `credit_decisioning.evaluate_loan()` | Run decisioning, emit format-locked output |
| `GET` | `/exceptions` | `credit_decisioning.list_exception_queue()` | Filterable by status, priority |
| `PATCH` | `/exceptions/{id}` | Resolve exception | With resolution, citation |
| `GET` | `/decisions` | `credit_decisioning.list_decision_logs()` | Audit viewer |
| `GET` | `/decisions/{id}` | Decision detail | Full reasoning chain |
| `GET` | `/audit` | `credit_decisioning.list_audit_records()` | |
| `GET` | `/corpus` | List corpus documents | |
| `POST` | `/corpus` | `credit_decisioning.ingest_document()` | Upload to walled garden |
| `GET` | `/corpus/{id}/passages` | List passages | |
| `POST` | `/portfolios/{id}/scenarios` | Create scenario | With assumptions_json |
| `POST` | `/seed` | Seed demo workspace | Creates 2 portfolios, loans, policies, decisions |

### Pydantic schemas: `backend/app/schemas/credit_v2.py` (new)

Follow the pattern in `backend/app/schemas/credit.py` and `backend/app/schemas/repe.py`.

---

## Part 3 — MCP Credit Tools

### File: `backend/app/mcp/tools/credit_tools.py` (new)

Follow the exact pattern of `backend/app/mcp/tools/repe_tools.py`. Use the same `_resolve_business_id()`, `_resolve_env_id()` helpers. Add credit-specific resolvers: `_resolve_portfolio_id()`, `_resolve_loan_id()`.

### Tool schemas: `backend/app/mcp/schemas/credit_tools.py` (new)

Follow the pattern of `backend/app/mcp/schemas/repe_tools.py`.

### Read Tools

| Tool Name | Description | Permission |
|-----------|-------------|------------|
| `credit.list_portfolios` | List portfolios for the current business with loan count and UPB rollups. | read |
| `credit.get_portfolio` | Get portfolio detail with KPI metrics. | read |
| `credit.list_loans` | List loans in a portfolio. Filterable by status, grade, vintage. | read |
| `credit.get_loan` | Get loan detail with borrower profile, event timeline, and decision history. | read |
| `credit.list_decisions` | List decision log entries. Filterable by decision type. | read |
| `credit.get_decision` | Get decision detail with full reasoning chain, citations, and format lock output. | read |
| `credit.list_exceptions` | List exception queue items. Filterable by status, priority. | read |
| `credit.get_exception` | Get exception detail with failing rules and recommended action. | read |
| `credit.list_policies` | List decision policies for a portfolio. | read |
| `credit.search_corpus` | Search the walled garden corpus. Returns passages with document metadata. | read |
| `credit.list_audit_records` | List audit records with reasoning steps. | read |
| `credit.get_environment_snapshot` | Get credit environment overview: portfolio count, total UPB, DQ rates, exception queue depth. | read |

### Write Tools

| Tool Name | Description | Permission |
|-----------|-------------|------------|
| `credit.create_portfolio` | Create a portfolio. Two-phase (confirmed=false, then confirmed=true). | write |
| `credit.create_loan` | Create a loan in a portfolio. Two-phase. | write |
| `credit.evaluate_loan` | Run decisioning engine against active policy. Produces format-locked output. | write |
| `credit.resolve_exception` | Resolve an exception queue item with citation. | write |
| `credit.ingest_document` | Ingest a document into the walled garden corpus. | write |
| `credit.create_policy` | Create a decision policy with rules. | write |

### Registration

Register in `backend/app/mcp/tools/credit_tools.py` via `register_credit_tools()`. Call from `backend/app/main.py` in the tool registration block (same location where `register_repe_tools()` is called).

---

## Part 4 — System Prompt: Credit Domain Block

### File: `backend/app/services/ai_gateway.py`

Add a new constant `_CREDIT_DOMAIN_BLOCK` that the system prompt builder conditionally appends when the active environment is a credit environment (detect via `industry_type` or `credit_initialized`).

```python
_CREDIT_DOMAIN_BLOCK = """
## Credit Decisioning Domain

You are operating inside a consumer credit decisioning environment. In addition to the standard rules above, the following constraints are absolute:

### Layer 1 — Deny-by-Default Walled Garden
- NEVER use general knowledge to answer questions about credit policy, underwriting criteria, or regulatory requirements.
- ONLY reference documents that exist in the environment's corpus (cc_corpus_document / cc_corpus_passage).
- Every factual assertion about policy, procedure, or regulation MUST include a citation: document_ref + passage_ref + excerpt.
- If the corpus does not contain the answer, say so explicitly. Do NOT guess.
- When the user asks about underwriting criteria, search the corpus first using credit.search_corpus before answering.

### Layer 2 — Chain-of-Thought Orchestration
- When evaluating a loan or answering a policy question, decompose the query into sub-questions.
- For each sub-question, retrieve the relevant corpus passage and validate it answers the sub-question directly.
- Show your reasoning: "Per [document_ref] section [passage_ref]: [excerpt]. Therefore: [conclusion]."
- Every decision produced by credit.evaluate_loan includes a full reasoning chain in the audit record.

### Layer 3 — Format Locks
- Decisioning outputs are schema-validated. Do NOT rephrase or summarize the structured output in a way that loses the rule-by-rule evaluation.
- Present the decision, then the rules evaluated (with PASS/FAIL for each), then the explanation, then the citations.
- Exception queue items must include: the failing rules, the gap between threshold and observed, and the recommended action from policy.
- Adverse action reasons must use ECOA-compliant codes from the corpus.

### Data Model
- The hierarchy is: Business → Environment → Portfolio → Loan → Loan Event
- Borrowers are linked to loans. Servicers are linked to portfolios.
- Decisioning runs against a portfolio's active policy.
- The exception queue holds loans that could not be auto-decided.
- The audit trail is immutable and append-only.

### Tool Routing
- Portfolio questions → credit.list_portfolios, credit.get_portfolio
- Loan questions → credit.list_loans, credit.get_loan
- "Run decisioning" / "evaluate this loan" → credit.evaluate_loan
- Policy questions → credit.search_corpus FIRST, then credit.list_policies
- Exception queue → credit.list_exceptions
- Audit/compliance questions → credit.list_audit_records, credit.get_decision
- "What does the policy say about X" → credit.search_corpus (NEVER answer from general knowledge)
"""
```

### Conditional injection

Update `_build_system_prompt_for_context()` to detect credit environments and append `_CREDIT_DOMAIN_BLOCK`:

```python
def _build_system_prompt_for_context(*, environment_name: str | None, environment_id: str | None, industry: str | None = None, credit_initialized: bool = False) -> str:
    base = _build_system_prompt()
    if credit_initialized or industry == "consumer_credit":
        base += _CREDIT_DOMAIN_BLOCK
    # ... existing environment-specific additions
    return base
```

---

## Part 5 — Credit Scope Resolution

### File: `backend/app/services/assistant_scope.py`

Extend `resolve_assistant_scope()` to handle credit entities. When the active module is `credit` (detected from `ui.active_module` in the context envelope):

1. Resolve portfolio_id from page scope (if route matches `/credit/portfolios/[portfolioId]`)
2. Resolve loan_id from page scope (if route matches `/credit/loans/[loanId]`)
3. Populate resolved scope with credit-specific fields: `active_portfolio_id`, `active_loan_id`
4. Auto-inject these into credit tool calls via `_maybe_attach_scope()`

### Context Envelope Extension

Add credit-specific fields to the `visible_data` block:

```json
{
  "ui": {
    "active_module": "credit",
    "visible_data": {
      "portfolios": [],
      "loans": [],
      "decisions": [],
      "exceptions": [],
      "policies": [],
      "corpus_documents": []
    }
  }
}
```

---

## Part 6 — Request Router: Credit Write Patterns

### File: `backend/app/services/request_router.py`

Add credit-specific write patterns:

```python
_CREDIT_WRITE_RE = re.compile(
    r"\b(create portfolio|create loan|evaluate loan|run decisioning|"
    r"resolve exception|ingest document|create policy|upload.*corpus|"
    r"add.*to.*corpus|new portfolio|new loan|approve|decline)\b",
    re.IGNORECASE,
)
```

In `classify_request()`, detect credit write intent and route to Lane B with low temperature:

```python
if _CREDIT_WRITE_RE.search(message):
    return RouteDecision(
        lane="B",
        skip_rag=False,   # Credit needs corpus search (walled garden)
        skip_tools=False,
        max_tool_rounds=3,  # Evaluate may need search + decide + log
        max_tokens=2048,    # Format-locked outputs are longer
        temperature=0.0,    # Decisioning is deterministic
    )
```

Also add a credit corpus-search pattern for Lane C (RAG + tools):

```python
_CREDIT_POLICY_RE = re.compile(
    r"\b(what does the policy say|underwriting criteria|"
    r"credit policy|regulatory|compliance|adverse action|"
    r"what are the rules for|exception handling|SLA)\b",
    re.IGNORECASE,
)

if _CREDIT_POLICY_RE.search(message):
    return RouteDecision(
        lane="C",
        skip_rag=False,
        skip_tools=False,
        max_tool_rounds=2,
        max_tokens=1536,
        temperature=0.0,
    )
```

---

## Part 7 — Frontend: Credit Workspace Pages

### Page surface (13 pages, mirroring REPE)

All routes under `/lab/env/[envId]/credit/`.

| Route | File | Purpose | REPE Equivalent |
|-------|------|---------|-----------------|
| `/credit/` | `page.tsx` (update) | Portfolio list + KPI strip | `/re/` fund list |
| `/credit/portfolios/new` | `portfolios/new/page.tsx` | Portfolio creation wizard | `/re/funds/new` |
| `/credit/portfolios/[portfolioId]` | `portfolios/[portfolioId]/page.tsx` | Portfolio detail: vintage chart, DQ trend, roll rates | `/re/funds/[fundId]` |
| `/credit/loans` | `loans/page.tsx` | Loan-level browser with filters | `/re/assets` |
| `/credit/loans/[loanId]` | `loans/[loanId]/page.tsx` | Loan detail: borrower, events, decision trail | `/re/assets/[assetId]` |
| `/credit/decisioning` | `decisioning/page.tsx` | Decision policy manager + exception metrics | `/re/waterfalls` |
| `/credit/decisioning/[policyId]` | `decisioning/[policyId]/page.tsx` | Policy rule editor + test console | Waterfall detail |
| `/credit/exceptions` | `exceptions/page.tsx` | Exception queue with SLA tracking | `/re/controls` |
| `/credit/performance` | `performance/page.tsx` | DQ curves, roll rates, loss rates by vintage | `/re/portfolio` |
| `/credit/forecasts` | `forecasts/page.tsx` | Loss forecast runs + scenario comparison | `/re/models` |
| `/credit/forecasts/[forecastId]` | `forecasts/[forecastId]/page.tsx` | Forecast detail: assumptions, projected vs actual | `/re/models/[modelId]` |
| `/credit/attributes` | `attributes/page.tsx` | Predictive attribute dashboard | New (no REPE equiv) |
| `/credit/documents` | `documents/page.tsx` | Walled garden corpus viewer | `/re/documents` |

### Hub page redesign

The current `page.tsx` is a case list. Replace with a portfolio-first layout matching REPE's `ReFundListPage`:

- KPI strip: Portfolio Count, Total UPB, 30+ DQ Rate, Net Loss Rate, Exception Queue Depth
- Portfolio table: Name, Product Type, Vintage, UPB, Loan Count, DQ Rate, Status
- Create Portfolio action
- Row links to portfolio detail

Keep the origination case list as a secondary tab ("Origination" tab alongside "Portfolio Analytics" tab).

### Context publisher

Each credit page must publish its entities to `window.__APP_CONTEXT__` via the context bridge (same pattern as REPE pages). Example for the portfolio detail page:

```typescript
useEffect(() => {
  if (portfolio) {
    window.__APP_CONTEXT__ = {
      ...window.__APP_CONTEXT__,
      credit: {
        active_portfolio_id: portfolio.portfolio_id,
        active_portfolio_name: portfolio.name,
        visible_loans: loans,
        visible_policies: policies,
        visible_exceptions: exceptions,
        metrics: portfolioKpis,
      }
    };
  }
}, [portfolio, loans, policies, exceptions, portfolioKpis]);
```

### DomainEnvProvider extension

Extend the existing `DomainEnvProvider` used by the credit layout to include credit-specific context: `portfolioId`, `policyId`, `activeModule: "credit"`.

---

## Part 8 — Seeder

### File: `backend/app/services/credit_decisioning.py` (extend)

Add `seed_credit_environment()` that creates:

**Corpus (4 documents, 11 passages):**
- POL-2025-042: Auto Loan Underwriting Policy v3.1 (4 passages: auto-approval, exception routing, auto-decline, LTV limits)
- REG-2025-008: ECOA Adverse Action Compliance Guide (2 passages: required disclosures, reason codes)
- PROC-2025-015: Exception Queue Operating Procedures (2 passages: SLA requirements, resolution documentation)
- MEMO-2025-003: Q1 2025 Credit Committee Guidance Memo (1 passage: portfolio targets)

**Portfolio 1: "Auto Prime 2025-A"**
- product_type: auto, origination_channel: direct, status: performing
- 1 active decision policy with 3 rules (auto-approve, exception-route, auto-decline)
- 1 base scenario + 1 stress scenario
- 50 loans across 4 vintages with borrower profiles
- 10 decision logs (6 auto-approve, 2 exception-route, 2 auto-decline)
- 2 exception queue items (1 open, 1 resolved)
- 10 audit records

**Portfolio 2: "Personal Unsecured 2024-B"**
- product_type: personal, status: performing
- 1 active decision policy
- 25 loans, higher-risk profile (FICO 600-720)
- 5 decision logs

---

## Part 9 — E2E Tests

### File: `repo-b/e2e/credit-decisioning.spec.ts` (new)

Test the full journey:

1. **Environment init**: Credit context resolves, credit_initialized becomes true
2. **Corpus**: Documents and passages are queryable
3. **Portfolio creation**: Form → API → table row
4. **Loan creation**: Within portfolio context
5. **Decisioning**: Run evaluate → decision log + audit record created
6. **Exception queue**: Exception-routed decision appears in queue
7. **Exception resolution**: Resolve with citation
8. **Audit trail**: All decisions and resolutions visible with reasoning chains
9. **Format lock validation**: Decision output matches CreditDecisionOutput_v1 schema
10. **Walled garden enforcement**: Query about non-corpus topic returns structured refusal

---

## Implementation Order

Do these in order. Each step is independently testable.

### Step 1 — Migrations (275 + 277 + credit_initialized column)

Run via Supabase dashboard or migration CLI. Verify with `\dt cc_*` in psql.

### Step 2 — Credit v2 routes + Pydantic schemas

Create `backend/app/routes/credit_v2.py` and `backend/app/schemas/credit_v2.py`. Mount at `/api/credit/v2` in `main.py`. Smoke test: `GET /api/credit/v2/portfolios` returns empty array.

### Step 3 — MCP credit tools + schemas

Create `backend/app/mcp/tools/credit_tools.py` and `backend/app/mcp/schemas/credit_tools.py`. Register in `main.py`. Verify: `GET /api/mcp/tools` lists `credit.list_portfolios`, `credit.evaluate_loan`, etc.

### Step 4 — System prompt + router

Add `_CREDIT_DOMAIN_BLOCK` to `ai_gateway.py`. Add credit patterns to `request_router.py`. Test: ask Winston "what does the policy say about auto-approval?" in a credit environment — should route to Lane C and attempt `credit.search_corpus`.

### Step 5 — Scope resolution

Extend `assistant_scope.py` for credit entities. Test: navigate to `/credit/portfolios/[portfolioId]`, ask Winston "show me the loans in this portfolio" — should resolve portfolio from page scope.

### Step 6 — Seeder

Run seed endpoint. Verify: 4 corpus documents, 2 portfolios, 75 loans, 15 decision logs, 2 exception queue items, 15 audit records exist.

### Step 7 — Frontend hub page redesign

Replace case list with portfolio list + KPI strip. Add origination tab toggle.

### Step 8 — Frontend detail pages (portfolio, loan, decisioning, exceptions)

Build the 4 highest-value pages. Each publishes context to `window.__APP_CONTEXT__`.

### Step 9 — Frontend remaining pages (performance, forecasts, attributes, documents)

Complete the page surface.

### Step 10 — E2E tests

Write and run `credit-decisioning.spec.ts`.

---

## Acceptance Criteria

**Walled Garden:**
- Winston refuses to answer credit policy questions from general knowledge when in a credit environment
- `credit.search_corpus` is called before any policy-related response
- Every policy assertion in Winston's response includes a citation (document_ref + passage_ref)
- Asking about a topic not in the corpus produces a structured refusal, not a guess

**Chain of Thought:**
- `credit.evaluate_loan` produces a decision log with `reasoning_steps_json` containing all 5 steps
- Every decision log has a corresponding `cc_audit_record` with the full chain
- Decision logs are immutable: no `UPDATE` path, no `updated_at` column

**Format Locks:**
- Decision output matches `CreditDecisionOutput_v1` schema (all required keys present, valid decision enum)
- Exception output matches exception schema
- `schema_valid` is `true` in every decision log
- Malformed tool output is rejected (test: send incomplete attributes to evaluate, observe structured handling)

**Parity with REPE:**
- Credit environment has its own KPI strip on the hub page
- Credit pages publish to `window.__APP_CONTEXT__`
- Winston resolves credit scope from page context without asking for IDs
- Credit write tools use the two-phase (confirmed=false/true) flow
- AdvancedDrawer shows credit tool calls with timings
- E2E test suite passes

---

## Files Changed Summary

| File | Change |
|------|--------|
| `repo-b/db/schema/275_credit_object_model.sql` | Deploy migration |
| `repo-b/db/schema/277_credit_workflow.sql` | Deploy migration |
| `repo-b/db/migrations/0XX_credit_initialized.sql` | Add column to app.environments |
| `backend/app/routes/credit_v2.py` | New — all v2 endpoints |
| `backend/app/schemas/credit_v2.py` | New — Pydantic models |
| `backend/app/services/credit_decisioning.py` | Extend — seeder, context init, remaining service functions |
| `backend/app/mcp/tools/credit_tools.py` | New — 18 tool handlers + `register_credit_tools()` |
| `backend/app/mcp/schemas/credit_tools.py` | New — tool input models |
| `backend/app/services/ai_gateway.py` | Add `_CREDIT_DOMAIN_BLOCK` + conditional injection |
| `backend/app/services/request_router.py` | Add `_CREDIT_WRITE_RE` + `_CREDIT_POLICY_RE` patterns |
| `backend/app/services/assistant_scope.py` | Extend for credit entity resolution |
| `backend/app/main.py` | Mount `/api/credit/v2`, call `register_credit_tools()` |
| `repo-b/src/app/lab/env/[envId]/credit/page.tsx` | Redesign — portfolio list + origination tab |
| `repo-b/src/app/lab/env/[envId]/credit/portfolios/new/page.tsx` | New |
| `repo-b/src/app/lab/env/[envId]/credit/portfolios/[portfolioId]/page.tsx` | New |
| `repo-b/src/app/lab/env/[envId]/credit/loans/page.tsx` | New |
| `repo-b/src/app/lab/env/[envId]/credit/loans/[loanId]/page.tsx` | New |
| `repo-b/src/app/lab/env/[envId]/credit/decisioning/page.tsx` | New |
| `repo-b/src/app/lab/env/[envId]/credit/decisioning/[policyId]/page.tsx` | New |
| `repo-b/src/app/lab/env/[envId]/credit/exceptions/page.tsx` | New |
| `repo-b/src/app/lab/env/[envId]/credit/performance/page.tsx` | New |
| `repo-b/src/app/lab/env/[envId]/credit/forecasts/page.tsx` | New |
| `repo-b/src/app/lab/env/[envId]/credit/forecasts/[forecastId]/page.tsx` | New |
| `repo-b/src/app/lab/env/[envId]/credit/attributes/page.tsx` | New |
| `repo-b/src/app/lab/env/[envId]/credit/documents/page.tsx` | New |
| `repo-b/src/lib/bos-api.ts` | Add credit v2 API client functions |
| `repo-b/src/lib/commandbar/appContextBridge.ts` | Add credit context publishing |
| `repo-b/e2e/credit-decisioning.spec.ts` | New — 10 test scenarios |
| `.skills/credit-decisioning/SKILL.md` | Already written — AI behavior contract |
| `docs/CONSUMER_CREDIT_ENVIRONMENT_PLAN.md` | Already written — architecture plan |
| `docs/WINSTON_CREDIT_DECISIONING_PROMPT.md` | This file |
