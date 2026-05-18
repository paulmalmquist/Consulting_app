# Meridian / REPE — Architecture

**Last updated:** 2026-05-16  
**Status:** Partially verified from route/service inspection

## Frontend map

### Routes (Lab environment)
| Route | File | Purpose |
|---|---|---|
| `/lab/env/[envId]/re` | `repo-b/src/app/lab/env/[envId]/re/` | REPE environment root |
| `.../re/funds` | `.../re/funds/` | Fund list and summary |
| `.../re/assets` | `.../re/assets/` | Asset list |
| `.../re/portfolio` | `.../re/portfolio/` | Portfolio overview |
| `.../re/waterfalls` | `.../re/waterfalls/` | Waterfall analysis |
| `.../re/scenarios` | `.../re/scenarios/` | Scenario modeling |
| `.../re/period-close` | `.../re/period-close/` | Period close workflow |
| `.../re/intelligence` | `.../re/intelligence/` | AI intelligence layer |
| `.../re/reports` | `.../re/reports/` | Reports surface |
| `.../re/capital-calls` | `.../re/capital-calls/` | Capital call management |
| `.../re/distributions` | `.../re/distributions/` | Distribution tracking |
| `.../re/investor` | `.../re/investors/` | Investor relations |
| `.../re/operator-diagnostics` | `.../re/operator-diagnostics/` | Operator diagnostics |
| `.../re/winston` | `.../re/winston/` | Winston AI for REPE |
| `.../re/sustainability` | `.../re/sustainability/` | ESG/sustainability |
| `.../re/variance` | `.../re/variance/` | Variance analysis |
| `.../re/validation` | `.../re/validation/` | Data validation |

### Routes (App surface)
| Route | File | Purpose |
|---|---|---|
| `/app/repe` | `repo-b/src/app/app/repe/` | REPE app root |
| `/app/re/*` | `repo-b/src/app/app/re/` | RE sub-surfaces (assets, funds, investors) |

### Frontend API routes
| Route | File | Purpose |
|---|---|---|
| `/api/re/v1/*` | `repo-b/src/app/api/re/v1/` | RE v1 API proxy |
| `/api/re/v2/*` | `repo-b/src/app/api/re/v2/` | RE v2 API proxy (authoritative state) |
| `/api/repe/funds/*` | `repo-b/src/app/api/repe/funds/` | Fund API proxy |
| `/api/repe/deals/*` | `repo-b/src/app/api/repe/deals/` | Deal API proxy |

## Backend map

### Routes
| File | Purpose |
|---|---|
| `backend/app/routes/re_authoritative.py` | Authoritative state endpoints |
| `backend/app/routes/re_financial_intelligence.py` | Financial intelligence |
| `backend/app/routes/re_fund.py` | Fund CRUD and KPIs |
| `backend/app/routes/re_geography.py` | Geographic analysis |
| `backend/app/routes/re_intelligence.py` | AI intelligence |
| `backend/app/routes/re_montecarlo.py` | Monte Carlo modeling |
| `backend/app/routes/re_operator_diagnostics.py` | Operator diagnostics |
| `backend/app/routes/re_opportunities.py` | Deal opportunities |
| `backend/app/routes/re_pipeline.py` | Pipeline management |
| `backend/app/routes/re_reports.py` | Report generation |
| `backend/app/routes/re_scenarios.py` | Scenario management |
| `backend/app/routes/re_surveillance.py` | Portfolio surveillance |
| `backend/app/routes/re_sustainability.py` | ESG |
| `backend/app/routes/re_valuation.py` | Valuation |
| `backend/app/routes/re_waterfall.py` | Waterfall calculations |
| `backend/app/routes/re_v2.py` | V2 endpoints (authoritative) |
| `backend/app/routes/repe.py` | General REPE routes |

### Finance module
| File | Purpose |
|---|---|
| `backend/app/finance/irr_engine.py` | IRR / XIRR calculations |
| `backend/app/finance/waterfall_engine.py` | Waterfall engine |
| `backend/app/finance/waterfall_american.py` | American waterfall variant |
| `backend/app/finance/waterfall_whole_fund.py` | Whole-fund waterfall |
| `backend/app/finance/scenario_engine.py` | Scenario modeling |
| `backend/app/finance/capital_account_engine.py` | Capital account tracking |
| `backend/app/finance/allocation_engine.py` | Allocation calculations |
| `backend/app/finance/clawback_engine.py` | Clawback calculations |

### Key services (partial)
| File | Purpose |
|---|---|
| `backend/app/services/re_fund_*.py` (15+ files) | Fund-level calculations |
| `backend/app/services/re_waterfall*.py` (5 files) | Waterfall services |
| `backend/app/services/re_scenario*.py` | Scenario services |
| `backend/app/services/repe_*.py` (7 files) | REPE domain services |
| `backend/app/services/re_accounting.py` | REPE accounting |
| `backend/app/services/investment_engine_audit.py` | Investment engine audit |

## Data map

### Authoritative state (CRITICAL)
- Read `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md` before any financial reads
- Backend function: `re_authoritative_snapshots.get_authoritative_state`
- Frontend hooks: `getReV2AuthoritativeState` / `useAuthoritativeState`
- **DO NOT** use `getFundBaseScenario`, `computeFundBaseScenario`, or raw SQL aggregations for released periods

### Known data issues
- IGF VII 2024Q4 gross_irr = 456% (implausible — likely XIRR on sparse early history)
- MCOF I 2025Q2 gross_irr = 366% (same suspected cause)

### Schema files
- `backend/app/schemas/repe.py`
- `backend/app/schemas/real_estate.py`
- `backend/app/schemas/re_authoritative.py`
- `backend/app/schemas/re_financial_intelligence.py`
- `backend/app/schemas/re_valuation.py`
- SQL migrations: `repo-b/db/schema/` — look for `re_*` and `repe_*` prefixed files

## AI / MCP / Runtime map

- Winston for REPE: `backend/app/routes/winston_demo.py`, `backend/app/routes/winston_eval_admin.py`
- Re intelligence: `backend/app/routes/re_intelligence.py`
- Re financial intelligence: `backend/app/routes/re_financial_intelligence.py`
- Assistant runtime: `backend/app/assistant_runtime/`

## Test map

- Lint enforcement: `verification/lint/no_legacy_repe_reads.py`
- State lock invariants: `backend/tests/test_state_lock_invariants.py`
- Needs repo verification for additional REPE-specific test files

## Needs verification

- [ ] Exact Supabase table names for funds, assets, investors, snapshots
- [ ] Which funds are currently in the system (beyond IGF VII and MCOF I)
- [ ] Whether period close is fully wired in the UI
- [ ] Waterfall UI — does it show real calculated values or mocked data?
- [ ] Whether `?audit_mode=1` renders AuditDrawer on all audited pages
- [ ] Early-period IRR outlier root cause (XIRR on sparse history vs. backfill runner bug)
