# Winston Query Agent Architecture
## Natural Language → Routed Execution → Visualization

---

## What this is

A user types a question — "show me NOI by asset for Q4 2025" or "what's our fund IRR if we exit Cascade at a 5.5 cap?" — and the system classifies the question, routes it to the right execution engine (SQL for lookups, Python for calculations), interprets the result, and renders the right visualization.

This replaces the current keyword-matching dashboard generator with something that can answer arbitrary questions against real data. The dashboard becomes the answer.

---

## The key architectural insight: two execution engines, not one

Not everything can be SQL. The system needs two execution paths:

### SQL path (lookups, filters, aggregations)
Questions that read stored data. Postgres is the right tool.
- "Show me NOI by asset this quarter" → SELECT from acct_statement_line
- "Which assets have occupancy below 90%?" → SELECT with WHERE filter
- "Revenue trend for Cascade Multifamily" → SELECT with quarter ordering
- "List all loans maturing in 2026" → SELECT from re_loan

### Python path (calculations that require iteration or date math)
Questions that require computation over cash flow sequences. SQL can't do these correctly — they need the existing Python engines in `backend/app/finance/`.

| Calculation | Why not SQL | Python engine | Source data |
|---|---|---|---|
| **XIRR / IRR** | Requires iterative root-finding (binary search) over date-weighted cash flows | `irr_engine.xirr()` | `re_capital_ledger_entry`, `re_cash_event` |
| **Waterfall distributions** | 4-tier allocation with preference accrual, catch-up, and carry split | `waterfall_engine.distribute()` | `re_capital_ledger_entry` |
| **Capital account rollforward** | Opening → contributions → distributions → fees → clawback → closing | `capital_account_engine` | `fin_capital_event` |
| **Gross/Net IRR bridge** | Sequential fee deduction: gross → minus mgmt fees → minus expenses → minus carry → net | `re_fund_metrics.compute_irr_bridge()` | `re_capital_ledger_entry` + fee schedule |
| **Monte Carlo simulation** | 1000 random paths × multi-asset × waterfall = not SQL | `re_model_monte_carlo` | Asset assumptions + cash flow templates |
| **DCF valuation** | 10-year projected NOI discounted at a target rate | `re_math.calculate_value_dcf()` | `re_asset_quarterly_financials` + assumptions |
| **Direct cap valuation** | NOI / cap rate (simple, but part of the Python math layer) | `re_math.calculate_value_direct_cap()` | Same |
| **DPI, TVPI, RVPI** | Aggregations over contributed/distributed/NAV with Decimal precision | `re_metrics.py` | `re_capital_ledger_entry` |
| **What-if scenarios** | "What if cap rate moves 50bps?" — re-run valuation with modified assumptions | `re_math` + `re_valuation_assumption_set` | Current assumptions + delta |

All Python calculations use `Decimal` arithmetic (not floats) and are already battle-tested in the backend. The agent should call them, not reimplement them.

---

## Where it lives: FastAPI backend (`backend/`)

**Route: `POST /re/v2/query`** — accessed from frontend via `bosFetch()` (Pattern A).

Why the FastAPI backend:
- Already has the DB connection pool, business_id scoping, and Railway deployment
- Already has the Python compute engines (`irr_engine`, `waterfall_engine`, `re_math`, etc.)
- SQL-only tools would need a separate RPC call to Python anyway — putting everything in FastAPI keeps it in one process
- Next.js API routes (repo-b) can't run Python

---

## The data catalog

The bridge between business language and database schema. Without it, the LLM invents table names.

### Entity hierarchy

```
business (repe_business)
  └── fund (repe_fund)               ← business_id FK
       ├── partner (re_partner)      ← fund_id FK
       └── deal (repe_deal)          ← fund_id FK
            └── asset (repe_asset)   ← deal_id FK
                 ├── property_asset (repe_property_asset)  ← asset_id FK
                 └── loan (re_loan)  ← asset_id FK
```

Every query scopes through `business_id` for tenant isolation.

### Tables — organized by domain

**Entity tables (the "what"):**

| Table | PK | Key columns | Business meaning |
|---|---|---|---|
| `repe_fund` | `fund_id` | `business_id`, `name`, `vintage_year`, `target_size` | A PE fund vehicle |
| `repe_deal` | `deal_id` | `fund_id`, `name`, `status` | An investment / deal within a fund |
| `repe_asset` | `asset_id` | `deal_id`, `name` | A physical asset backing a deal |
| `repe_property_asset` | `asset_id` | `units`, `property_type`, `market`, `submarket` | CRE-specific asset detail (multifamily, office, etc.) |
| `re_partner` | `partner_id` | `fund_id`, `name`, `commitment` | An LP or GP in a fund |
| `re_loan` | `loan_id` | `asset_id`, `loan_amount`, `interest_rate`, `maturity_date`, `loan_type` | Debt on an asset |

**Financial statement tables (the "how much" — SQL-queryable):**

| Table | Key columns | Business meaning |
|---|---|---|
| `acct_statement_line` | `entity_id`, `entity_type`, `quarter`, `scenario`, `line_code`, `amount` | Processed statement lines (IS/CF/BS). The workhorse table for most operating metrics. |
| `acct_statement_line_def` | `line_code`, `label`, `statement_type`, `sort_order` | Definitions: what each line_code means |
| `re_asset_quarterly_financials` | `asset_id`, `quarter`, `noi`, `occupancy_pct`, `egi`, `total_opex` | Raw quarterly operating data |
| `re_asset_quarter_state` | `asset_id`, `quarter`, `nav`, `noi`, `opex`, `capex`, `debt_balance` | Quarterly snapshot per asset |
| `re_fund_quarter_state` | `fund_id`, `quarter`, `portfolio_nav`, `gross_irr`, `net_irr`, `dpi`, `tvpi` | Fund-level quarterly snapshot |
| `re_fund_metrics_qtr` | `fund_id`, `quarter`, `gross_irr`, `net_tvpi`, `dpi`, `portfolio_nav` | Fund performance metrics |
| `re_partner_quarter_metrics` | `partner_id`, `quarter`, `contributed`, `distributed`, `nav`, `dpi`, `tvpi`, `irr` | Per-LP quarterly metrics |
| `re_valuation_snapshot` | `asset_id`, `quarter`, `appraised_value`, `equity_value` | Appraised values |

**Cash flow tables (the "when" — feed Python calculations):**

| Table | Key columns | Business meaning |
|---|---|---|
| `re_capital_ledger_entry` | `fund_id`, `partner_id`, `entry_type`, `amount`, `effective_date`, `quarter` | Institutional capital ledger. Entry types: commitment, contribution, distribution, fee, recallable_dist, trueup, reversal |
| `re_cash_event` | `fund_id`, `asset_id`, `event_type`, `amount`, `event_date` | Fund cash flow events. Types: CALL, DIST, FEE, EXPENSE, OPERATING_CASH, LOAN_DRAW, LOAN_PAYDOWN |
| `fin_capital_event` | `fin_entity_id`, `event_type`, `direction`, `amount`, `effective_date` | Enterprise finance ledger (debit/credit) |
| `fin_capital_rollforward` | `fin_entity_id`, `as_of_date`, `opening_balance`, `contributions`, `distributions`, `fees`, `closing_balance` | Period rollforward snapshots |
| `fin_irr_result` | `fin_entity_id`, `as_of_date`, `irr`, `method`, `cashflow_count` | Pre-computed IRR results |
| `re_loan_amortization` | `loan_id`, `period`, `beginning_balance`, `interest`, `principal`, `ending_balance` | Amortization schedules |

**Assumption / configuration tables:**

| Table | Key columns | Business meaning |
|---|---|---|
| `re_valuation_assumption_set` | `asset_id`, `cap_rate`, `discount_rate`, `exit_cap_rate` | Valuation assumptions per asset |

---

## Pipeline: how a query flows

```
User types:
"What's our fund IRR after the Q4 distributions?"

         │
         ▼
┌──────────────────────────────┐
│  POST /re/v2/query           │
│  body: { prompt,             │
│    env_id, business_id,      │
│    quarter? }                │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  1. ROUTER (LLM call)        │
│                              │
│  Classifies the question     │
│  into an execution plan:     │
│                              │
│  → route: "sql" | "python"   │
│  → intent: what's being asked│
│  → entity_type: fund/asset/… │
│  → params: extracted values  │
│    (threshold, cap rate, etc)│
│  → python_fn: if routed to   │
│    Python, which function    │
└──────────┬───────────────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌──────────┐ ┌──────────────────────┐
│ SQL PATH │ │ PYTHON PATH          │
└────┬─────┘ └────┬─────────────────┘
     │             │
     ▼             ▼
┌──────────┐ ┌──────────────────────┐
│ 2a. LLM  │ │ 2b. Call existing     │
│ writes   │ │ Python engine with    │
│ SELECT   │ │ extracted params:     │
│ query    │ │                       │
│          │ │ • xirr(cashflows)     │
│          │ │ • waterfall(entries)  │
│          │ │ • dcf(noi, rate, yrs) │
│          │ │ • cap_val(noi, cap)   │
│          │ │ • monte_carlo(assets) │
│          │ │ • irr_bridge(fund)    │
│          │ │ • dpi(dist, contrib)  │
│          │ │ • rollforward(events) │
└────┬─────┘ └────┬─────────────────┘
     │             │
     ▼             │
┌──────────┐       │
│ 3. SQL   │       │
│ validator│       │
│ (safety) │       │
└────┬─────┘       │
     │             │
     ▼             │
┌──────────┐       │
│ 4. Exec  │       │
│ Postgres │       │
└────┬─────┘       │
     │             │
     └──────┬──────┘
            │  unified result
            ▼
┌──────────────────────────────┐
│  5. INTERPRETER              │
│  (deterministic)             │
│                              │
│  Inspects result shape:      │
│  • scalar → KPI card         │
│  • entity + metric → bar     │
│  • time series → trend line  │
│  • distribution tiers → wtrfl│
│  • cashflow sequence → table │
│  • many metrics → dashboard  │
│                              │
│  Python results get extra    │
│  metadata:                   │
│  • computation_type: "xirr"  │
│  • precision: "12 decimals"  │
│  • cashflow_count: 47        │
│  • method: "binary_search"   │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  6. RESPONSE                 │
│  {                           │
│    route: "sql" | "python",  │
│    visualization: "...",     │
│    data: [...],              │
│    columns: [...],           │
│    sql?: "...",              │
│    computation?: {           │
│      type: "xirr",          │
│      method: "binary_search",│
│      cashflow_count: 47,     │
│      precision: "Decimal"    │
│    },                        │
│    spec?: DashboardSpec      │
│  }                           │
└──────────────────────────────┘
```

---

## The router prompt (step 1)

This is the most critical piece. It classifies intent AND determines the execution path.

```
You are a query router for a real estate private equity (REPE) analytics system.
Given a user's natural language question, classify it and produce a routing plan.

## Route: "sql"
Use for questions that read stored data: lookups, filters, aggregations, rankings, time series.
Examples:
  - "Show me NOI by asset" → sql
  - "Which assets have occupancy below 90%?" → sql
  - "Revenue trend for Q1-Q4" → sql
  - "List loans maturing in 2026" → sql
  - "Compare NOI across all multifamily assets" → sql

## Route: "python"
Use for questions that require CALCULATION over cash flow sequences or iterative math.
These CANNOT be done correctly in SQL.

| Question pattern | python_fn | Required data |
|---|---|---|
| "What's our IRR" / "fund returns" / "compute XIRR" | xirr | cash flows from re_capital_ledger_entry |
| "Run the waterfall" / "GP carry" / "LP distributions" | waterfall | capital ledger + fund terms |
| "Capital account rollforward" | rollforward | fin_capital_event |
| "Gross to net bridge" / "fee impact on returns" | irr_bridge | capital ledger + fee schedule |
| "Monte Carlo" / "probability of" / "simulate" | monte_carlo | asset assumptions |
| "DCF valuation" / "10-year model" | dcf | quarterly financials + discount rate |
| "What if cap rate is X" / "sensitivity" | what_if_valuation | current assumptions + delta |
| "DPI" / "TVPI" when computing fresh (not reading stored) | ratio_calc | capital ledger |

## IMPORTANT: pre-computed vs. fresh calculation

Some metrics exist BOTH as stored snapshots AND as computable values:
- re_fund_metrics_qtr has stored gross_irr, net_tvpi, dpi
- re_partner_quarter_metrics has stored irr, dpi, tvpi
- fin_irr_result has cached XIRR results

If the user asks "what's our fund IRR?" → route to SQL (read the snapshot).
If the user asks "recalculate IRR with the latest cash flows" or "what would IRR be if…" → route to Python.
If the user asks about a what-if scenario → always Python.

## Output format (JSON only, no markdown):
{
  "route": "sql" | "python",
  "intent": "brief description of what's being asked",
  "entity_type": "fund" | "deal" | "asset" | "partner",
  "python_fn": null | "xirr" | "waterfall" | "rollforward" | "irr_bridge" | "monte_carlo" | "dcf" | "what_if_valuation" | "ratio_calc",
  "params": {
    "quarter": "2025Q4" | null,
    "threshold": 1.25 | null,
    "cap_rate": 0.055 | null,
    "scenario": "actual" | "budget" | null
  }
}
```

---

## Python function registry

Each routable Python function maps to an existing engine in `backend/app/finance/` or `backend/app/services/`:

```python
PYTHON_REGISTRY = {
    "xirr": {
        "engine": "backend/app/finance/irr_engine.py",
        "function": "xirr(cashflows: list[tuple[date, Decimal]]) -> Decimal",
        "data_source": "re_capital_ledger_entry (query by fund_id + partner_id, order by effective_date)",
        "precision": "Decimal, binary search, act/365f day count",
        "result_shape": "scalar (rate as Decimal, e.g. 0.1247 = 12.47%)",
        "visualization": "kpi",
    },
    "waterfall": {
        "engine": "backend/app/finance/waterfall_engine.py",
        "function": "distribute(capital_events, fund_terms) -> WaterfallResult",
        "data_source": "re_capital_ledger_entry + fund preference/carry terms",
        "result_shape": "4 tiers: return_of_capital, preferred_return, gp_catchup, carry_split + residual",
        "visualization": "waterfall_chart",
    },
    "rollforward": {
        "engine": "backend/app/finance/capital_account_engine.py",
        "function": "build_rollforward(events, as_of) -> RollforwardResult",
        "data_source": "fin_capital_event",
        "result_shape": "opening + contributions + distributions + fees + accruals + clawbacks + closing",
        "visualization": "table",
    },
    "irr_bridge": {
        "engine": "backend/app/services/re_fund_metrics.py",
        "function": "compute_irr_bridge(fund_id, quarter)",
        "data_source": "re_capital_ledger_entry + fee schedule",
        "result_shape": "gross_return → minus_mgmt_fees → minus_expenses → minus_carry → net_return",
        "visualization": "waterfall_chart",
    },
    "monte_carlo": {
        "engine": "backend/app/services/re_model_monte_carlo.py",
        "function": "run_simulation(assets, n_simulations=1000, seed=42)",
        "data_source": "Asset assumptions + cash flow templates",
        "result_shape": "distribution of outcomes: p10, p25, p50, p75, p90 + histogram data",
        "visualization": "histogram or box_plot",
    },
    "dcf": {
        "engine": "backend/app/services/re_math.py",
        "function": "calculate_value_dcf(noi_series, discount_rate, exit_cap, hold_years=10)",
        "data_source": "re_asset_quarterly_financials + re_valuation_assumption_set",
        "result_shape": "present_value, exit_value, total_value, implied_cap_rate",
        "visualization": "kpi or table",
    },
    "what_if_valuation": {
        "engine": "backend/app/services/re_math.py",
        "function": "calculate_value_direct_cap(noi, cap_rate)",
        "data_source": "Current NOI + user-specified cap rate delta",
        "result_shape": "base_value, new_value, delta, delta_pct",
        "visualization": "comparison_table or bar_chart",
    },
    "ratio_calc": {
        "engine": "backend/app/services/re_metrics.py",
        "function": "compute_dpi / compute_tvpi / compute_rvpi",
        "data_source": "re_capital_ledger_entry aggregated",
        "result_shape": "scalar ratio (Decimal, 4dp)",
        "visualization": "kpi",
    },
}
```

---

## SQL path: the system prompt for the SQL generator (step 2a)

```
You are a read-only SQL agent for a real estate private equity (REPE) database.
Generate a single PostgreSQL SELECT query. Never INSERT, UPDATE, DELETE, DROP, or TRUNCATE.

## Tenant scoping
Every query MUST filter by business_id. The hierarchy is:
  repe_fund.business_id = :business_id
  repe_deal → repe_fund via deal.fund_id
  repe_asset → repe_deal via asset.deal_id
  repe_property_asset → repe_asset via property_asset.asset_id
  re_loan → repe_asset via loan.asset_id
  acct_statement_line → entity_id (join via asset/deal hierarchy)

## Tables you may query
[full catalog from above — entity tables, statement tables, snapshot tables]
[EXCLUDE cash flow tables — those feed Python, not direct SQL]

## Line codes in acct_statement_line
RENT, OTHER_INCOME, EGI, PAYROLL, REPAIRS_MAINT, UTILITIES, TAXES, INSURANCE,
MGMT_FEES, TOTAL_OPEX, NOI, NOI_MARGIN, CAPEX, TENANT_IMPROVEMENTS,
LEASING_COMMISSIONS, REPLACEMENT_RESERVES, DEBT_SERVICE_INT, DEBT_SERVICE_PRIN,
TOTAL_DEBT_SERVICE, NET_CASH_FLOW, DSCR, DEBT_YIELD

## Common query patterns
[same examples as before — NOI by asset, fund returns, watchlist]

## Output: SQL only. No markdown. No explanation.
```

---

## Result interpretation (step 5) — expanded for Python results

```python
def interpret_result(route, columns, rows, python_fn=None):
    # Python results have known shapes
    if route == "python":
        PYTHON_VIZ = {
            "xirr": "kpi",
            "waterfall": "waterfall_chart",
            "rollforward": "table",
            "irr_bridge": "waterfall_chart",
            "monte_carlo": "histogram",
            "dcf": "kpi_group",      # multiple related KPIs
            "what_if_valuation": "comparison_bar",
            "ratio_calc": "kpi",
        }
        return PYTHON_VIZ.get(python_fn, "table")

    # SQL results — infer from shape
    col_count = len(columns)
    row_count = len(rows)
    col_names = [c.lower() for c in columns]

    if row_count == 1 and col_count == 1:
        return "kpi"
    if col_names[0] in ("quarter", "date", "period") and col_count >= 2:
        return "trend_line" if col_count <= 3 else "bar_chart"
    if col_count == 2 and col_names[0] in ("name", "asset", "fund", "deal"):
        return "bar_chart"
    if col_count >= 4 and col_names[0] in ("name", "asset", "fund", "deal"):
        return "dashboard_spec"
    return "table"
```

---

## Safety constraints

Non-negotiable, enforced in code:

1. **SQL path — read-only**: parse tree check rejects INSERT/UPDATE/DELETE/DROP/TRUNCATE/GRANT/COPY.
2. **SQL path — tenant isolation**: confirm business_id in WHERE clause before executing.
3. **SQL path — table allowlist**: only tables in the catalog. Blocks `app.users`, `app.document_*`, credentials.
4. **SQL path — timeout**: 10-second `statement_timeout` on the agent connection.
5. **SQL path — no DDL**: agent DB user has SELECT-only grants.
6. **Python path — function allowlist**: only functions in the registry. No `eval()`, no arbitrary code execution.
7. **Python path — parameter validation**: cap_rate must be 0.01–0.20, hold_years must be 1–30, n_simulations max 5000, etc.
8. **Both paths — result size cap**: max 500 rows returned. Truncate with a "showing 500 of N" message.

---

## Build sequence

### Phase 1: Foundation (catalog + router + SQL path)

1. **Data catalog** (`backend/app/sql_agent/catalog.py`) — structured representation of all tables, columns, business meaning. Source of truth for the router and SQL generator prompts.

2. **Router** (`backend/app/sql_agent/router.py`) — LLM call that classifies intent and picks sql vs python path.

3. **SQL generator** (`backend/app/sql_agent/sql_generator.py`) — LLM writes the SELECT query using catalog context.

4. **SQL validator** (`backend/app/sql_agent/validator.py`) — parse tree safety.

5. **SQL executor** — thin wrapper with timeout around existing pool.

6. **Interpreter** (`backend/app/sql_agent/interpreter.py`) — result shape → visualization type.

7. **Route** (`backend/app/routes/re_query.py`) — `POST /re/v2/query`.

8. **Frontend** (`repo-b/src/components/repe/dashboards/QueryResultRenderer.tsx`).

### Phase 2: Python path

9. **Python dispatcher** (`backend/app/sql_agent/python_dispatcher.py`) — maps `python_fn` string to actual engine call, handles parameter extraction, loads cash flow data from DB, calls the engine, formats the result.

10. **Function registry** — the mapping table above, with input validation schemas per function.

11. **Expand the router prompt** with Python examples and test cases.

### Phase 3: MCP wrapper

12. **MCP server** — single file wrapping `POST /re/v2/query` as a tool. Exposes `query_repe_data(prompt, business_id, quarter?)` to any MCP-compatible client (Claude Code, Claude in Chrome, external agents).

---

## Example queries and their routes

| User question | Route | Execution | Visualization |
|---|---|---|---|
| "Show me NOI by asset this quarter" | sql | SELECT from acct_statement_line | bar_chart |
| "Which assets have DSCR below 1.2?" | sql | SELECT with WHERE filter | table |
| "Revenue trend for Cascade Multifamily" | sql | SELECT ordered by quarter | trend_line |
| "What's our fund IRR?" | sql | SELECT from re_fund_metrics_qtr | kpi |
| "Recalculate IRR with latest cash flows" | python | `xirr()` over re_capital_ledger_entry | kpi |
| "Run the waterfall for Fund II" | python | `waterfall_engine.distribute()` | waterfall_chart |
| "What if cap rate moves to 5.5%?" | python | `re_math.calculate_value_direct_cap()` | comparison_bar |
| "Capital account rollforward for Q4" | python | `capital_account_engine` | table |
| "Monte Carlo on the portfolio" | python | `re_model_monte_carlo` (1000 sims) | histogram |
| "Gross to net IRR bridge" | python | `compute_irr_bridge()` | waterfall_chart |
| "Occupancy across all Phoenix assets" | sql | SELECT with market filter | bar_chart |
| "DCF valuation for Cascade at 7% discount" | python | `re_math.calculate_value_dcf()` | kpi_group |
| "Compare budget vs actual NOI" | sql | SELECT with scenario filter | bar_chart |
| "Loan maturity schedule" | sql | SELECT from re_loan ORDER BY maturity | table |
