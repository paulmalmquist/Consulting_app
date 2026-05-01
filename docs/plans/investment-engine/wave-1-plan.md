# Wave 1 Plan — Risk + Compliance

- **Wave:** 1
- **Modules:** `risk_engine`, `compliance`
- **Status:** Approved for implementation
- **Authored:** 2026-04-30
- **Drives:** Migrations 483–487, services + routes + frontend extensions, tests
- **Blocks:** Wave 2 (OMS — needs compliance pre-trade contract; EMS; workflow)
- **Depends on:** Wave 0 complete (V1 acceptance gate closed)

## What this plan covers

Two parallel modules built against the schema, services, snapshot pattern, and audit hooks established in Wave 0. They are independent of each other (a compliance breach doesn't depend on a VaR figure and vice versa) so they run on parallel branches and can be built by parallel agents.

The Wave 0 patterns are NON-NEGOTIABLE for both modules:

- Per-module discipline from `skills/winston-investment-engine-module` (schema → service → route → audit → tests, EngineResult shape, fail-closed)
- Snapshot lifecycle from `skills/winston-investment-snapshot` (draft → locked → released → superseded, immutability trigger, reconstruct contract) — applies to risk_engine; compliance violations follow the immutable-on-load-bearing-fields pattern instead since they're operational, not authoritative
- ADRs 001 (lots), 002 (currency), 003 (bi-temporal) all apply
- New ADRs 004 (VaR method) and 005 (compliance rule DSL) — both Accepted; lock before schema lands

## Sequencing inside Wave 1

```
ADR 004 ──┐
          ├──► Risk schema (483)  ──► Risk service ──► Risk routes ──► Risk frontend ──┐
          │                                                                              ├──► Wave 1 close gate
ADR 005 ──┴──► Compliance schema (484-487) ──► Compliance service ──► Compliance routes ─┘
                                                                       └──► Compliance frontend ─┘
```

Risk and compliance run independently on parallel branches. Wave 2 (OMS) depends on the **compliance pre-trade contract** being locked and the route shipped — but not necessarily on the full risk module being deployed. So if speed matters, ship compliance first; risk can land second.

## ADRs (already authored — read before starting)

- [ADR 004 — VaR method](../adr/investment-engine/004-var-method.md): historical sim + parametric, both stored, golden tests required
- [ADR 005 — Compliance rule DSL](../adr/investment-engine/005-compliance-rule-dsl.md): six fixed operators in JSONB, no code-defined rules

---

## MODULE 1 — `risk_engine`

### Scope

Per the [INVESTMENT_ENGINE_PLAN.md](../INVESTMENT_ENGINE_PLAN.md) Wave 1 description:

- Value at Risk (VaR) — historical sim + parametric per ADR 004
- Stress scenarios — apply a scenario shock vector to current positions, recompute MV
- Sensitivity — DV01 (rate), beta (equity), delta (option/derivative basics)
- Factor exposures — equity (size, value, momentum), fixed income (duration, spread)
- Performance attribution — split realized + unrealized P&L by factor

### Schema — migration `483_inv_risk.sql`

Three tables. `inv_risk_snapshot` follows the snapshot pattern; `inv_factor` and `inv_factor_loading` are reference data.

#### `inv_risk_snapshot`

Authoritative output. Standard snapshot shape (universal cols + bi-temporal cols + lifecycle cols + `input_versions`) plus payload.

Payload columns specific to risk:

| Column | Type | Notes |
|---|---|---|
| `risk_kind` | text NOT NULL CHECK IN ('var','scenario','sensitivity','factor_exposure','attribution') | what kind of risk output this row stores |
| `var_method` | text CHECK IN ('historical_sim','parametric') | required when risk_kind='var' (ADR 004) |
| `confidence_pct` | numeric(5,2) | required when risk_kind='var' |
| `horizon_days` | int | required when risk_kind='var' |
| `history_window_days` | int | required when risk_kind='var' |
| `covariance_method` | text | parametric only |
| `var_native` | numeric(28,8) | the loss figure |
| `var_currency` | char(3) | |
| `portfolio_value_native` | numeric(28,8) | for context |
| `scenario_id` | uuid REFERENCES inv_scenario(id) | required when risk_kind='scenario' |
| `scenario_pnl_native` | numeric(28,8) | scenario output |
| `sensitivity_kind` | text CHECK IN ('dv01','beta','delta') | required when risk_kind='sensitivity' |
| `sensitivity_value` | numeric(28,8) | |
| `factor_id` | uuid REFERENCES inv_factor(id) | required when risk_kind='factor_exposure' |
| `factor_exposure` | numeric(28,8) | |
| `attribution_breakdown` | jsonb | for risk_kind='attribution': {factor_id: contribution} map |

Partial unique index per skill: `(entity_id, effective_date, risk_kind, COALESCE(var_method,''), COALESCE(confidence_pct, 0), COALESCE(horizon_days, 0), COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(factor_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE status = 'released'`. Long; necessary because one (fund, date) can have many risk outputs.

Standard `inv_block_released_mutation` trigger; standard updated_at trigger.

#### `inv_factor`

Reference data — the factor library. One row per factor.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `env_id`, `business_id` | universal | |
| `code` | text NOT NULL | unique per env |
| `name` | text NOT NULL | |
| `factor_kind` | text NOT NULL CHECK IN ('equity','fixed_income','macro','custom') | |
| `dimension` | text NOT NULL | e.g., 'size', 'value', 'momentum', 'duration', 'spread' |
| `definition` | jsonb NOT NULL DEFAULT '{}' | how the factor is computed (formula reference, source, lookback) |
| `created_at`, `updated_at` | timestamptz | |

Unique index `(env_id, code)`. Seeded with a starter set per env: `EQ.SIZE`, `EQ.VALUE`, `EQ.MOMENTUM`, `FI.DURATION`, `FI.SPREAD`.

#### `inv_factor_loading`

Per (security, factor, effective_date) loading. Bi-temporal — supersession chain on corrections.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `env_id`, `business_id` | universal | |
| `security_id` | uuid NOT NULL REFERENCES inv_security(id) | |
| `factor_id` | uuid NOT NULL REFERENCES inv_factor(id) | |
| `effective_date` | date NOT NULL | |
| `loading` | numeric(28,8) NOT NULL | exposure of the security to the factor |
| `source` | text NOT NULL | e.g., 'computed_from_returns', 'manual', 'external_provider' |
| `published_at` | timestamptz NOT NULL DEFAULT now() | |
| `superseded_by_id` | uuid REFERENCES inv_factor_loading(id) | |
| `created_at`, `updated_at` | timestamptz | |

Partial unique on `(env_id, security_id, factor_id, effective_date) WHERE superseded_by_id IS NULL`. Edit-block trigger (mirrors `inv_block_price_edit`).

#### `inv_scenario`

Reference data — named scenarios (historical: 2008-Q4, 2020-Q1; or custom shock vectors).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `env_id`, `business_id` | universal | |
| `code` | text NOT NULL | unique per env |
| `name` | text NOT NULL | |
| `kind` | text NOT NULL CHECK IN ('historical','custom') | |
| `shocks` | jsonb NOT NULL | `{ "EQ.US": -0.30, "FI.US.10Y": 0.015, "FX.EURUSD": -0.05 }` |
| `description` | text | |
| `created_at`, `updated_at` | timestamptz | |

Unique `(env_id, code)`. Seeded with two starter scenarios per env: `historical_2008_q4`, `historical_2020_q1`.

### Service — `backend/app/services/risk_engine.py`

Public functions:

```python
def calculate_var(
    *, env_id: str, fund_id: UUID, as_of_date: date,
    confidence_pct: Decimal = Decimal("95.00"),
    horizon_days: int = 1,
    history_window_days: int = 252,
    ewma_lambda: Optional[Decimal] = None,
) -> EngineResult: ...

def apply_scenario(
    *, env_id: str, fund_id: UUID, as_of_date: date, scenario_id: UUID,
) -> EngineResult: ...

def calculate_sensitivity(
    *, env_id: str, fund_id: UUID, as_of_date: date,
    sensitivity_kind: Literal["dv01", "beta", "delta"],
) -> EngineResult: ...

def calculate_factor_exposure(
    *, env_id: str, fund_id: UUID, as_of_date: date,
    factor_id: Optional[UUID] = None,  # None = all configured factors
) -> EngineResult: ...

def attribute_performance(
    *, env_id: str, fund_id: UUID, start_date: date, end_date: date,
) -> EngineResult: ...
```

Pure compute helpers (no DB):

```python
def _parametric_var(weights: list[Decimal], cov: list[list[Decimal]],
                     confidence: Decimal, horizon_days: int) -> Decimal: ...

def _historical_sim_var(returns_matrix: list[list[Decimal]], weights: list[Decimal],
                         confidence: Decimal, horizon_days: int) -> Decimal: ...

def _apply_shock(positions: list[Position], shocks: dict[str, Decimal]) -> Decimal:
    """Returns total scenario P&L in fund base currency."""
```

Error codes (in addition to the universal set):

| Code | Meaning |
|---|---|
| `missing_history` | a position has < `history_window_days` price observations |
| `missing_factor_loading` | (security, factor) loading absent for effective_date |
| `unknown_scenario` | scenario_id not in inv_scenario for env |
| `singular_covariance` | covariance matrix is non-invertible (degenerate portfolio) |
| `attribution_input_mismatch` | period start/end snapshots don't match the same fund |

Snapshot writer module: `backend/app/services/risk_snapshot_writer.py` (mirrors `accounting_snapshot_writer.py`):

```python
def produce_var_snapshot_pair(...)    # writes BOTH historical_sim + parametric in one tx
def produce_scenario_snapshot(...)
def produce_factor_exposure_snapshot(...)
def lock_risk_snapshot(...)
def release_risk_snapshot(...)
def reconstruct_risk_snapshot(...)
```

### Routes — extend `backend/app/routes/investment_engine.py`

```
POST /api/investment-engine/risk/var
POST /api/investment-engine/risk/scenario
POST /api/investment-engine/risk/sensitivity
POST /api/investment-engine/risk/factor-exposure
POST /api/investment-engine/risk/attribution

POST /api/investment-engine/risk/snapshots/produce/{kind}
POST /api/investment-engine/risk/snapshots/{id}/lock
POST /api/investment-engine/risk/snapshots/{id}/release
GET  /api/investment-engine/risk/snapshots/{id}/reconstruct

GET  /api/investment-engine/risk/factors                  (list)
GET  /api/investment-engine/risk/scenarios                (list)
```

Strict pydantic with `extra="forbid"`, structured errors, 422 on invalid. Same envelope as Wave 0.

### Frontend — extend `repo-b/src/app/lab/env/[envId]/investment-engine/page.tsx`

Add a fourth tab: **Risk**. Sub-tabs:

- **VaR** — fund picker, confidence/horizon dropdowns, history window input, "Calculate" button. Result panel shows historical-sim VaR and parametric VaR side by side with method tags. If they diverge >20%, show a warning chip.
- **Scenarios** — fund picker, scenario picker (loaded from `/risk/scenarios`), "Apply" button. Result shows scenario P&L in base currency.
- **Factor Exposures** — fund picker, factor multi-select, table of (factor → exposure).
- **Attribution** — fund picker, period start/end, table breaking down P&L by factor.

The "Unavailable" component from Wave 0 applies when any required input is missing. Snapshot lifecycle controls (Produce/Lock/Release/Reconstruct) appear on VaR and scenario results, mirroring the NAV pattern.

### Tests

`backend/tests/test_risk_engine.py`:

- **Pure compute (golden tests, non-negotiable):**
  - Two-asset portfolio with covariance matrix `[[0.04, 0.01], [0.01, 0.09]]`, weights [0.5, 0.5]: parametric 95% 1-day VaR matches `1.645 × sqrt(0.5² × 0.04 + 2×0.5×0.5×0.01 + 0.5² × 0.09)` to 6 decimals.
  - Historical sim against a 1000-day returns matrix produces exactly the empirical 5%-percentile loss.
  - Scenario shock `{"EQ.US": -0.30}` against a $100 EQ.US position produces -$30 P&L exactly.
  - DV01 of a $1M par 10y bond at 4% yield produces ~$830 DV01 (textbook).
- **Fail-closed:** missing price history, missing factor loading, missing scenario, singular covariance.
- **Determinism:** 50-run loops on each function.
- **Snapshot lifecycle (integration):** produce → lock → release → reconstruct equal; verify two rows on VaR pair.

Playwright additions in `repo-b/tests/investment-engine.spec.ts`:

- Risk tab: VaR happy path renders both methods.
- Risk tab: VaR with missing-history mock renders error envelope.

---

## MODULE 2 — `compliance`

### Scope

- Pre-trade evaluation (sync, blocking — OMS in Wave 2 calls it before sending to EMS)
- Post-trade evaluation (after fills, before NAV close)
- Six fixed operators per ADR 005
- Violations stored, immutable on load-bearing fields, resolution metadata mutable

### Schema — migration `484_inv_compliance.sql`

Two tables. Full DDL in [ADR 005](../adr/investment-engine/005-compliance-rule-dsl.md).

- `inv_compliance_rule` — bi-temporal (active_from/active_to), JSONB predicate, fixed operator CHECK
- `inv_compliance_violation` — append-only on load-bearing fields, resolution metadata mutable

Plus a starter seed migration `485_inv_compliance_seed.sql` (env-scoped sample rules per template — restricted_list of OFAC-flagged tickers, max_pct_of_nav 5% issuer cap as defaults).

### Service — `backend/app/services/compliance_engine.py`

```python
def evaluate_pre_trade(
    *, env_id: str, fund_id: UUID, proposed_trade: dict, as_of_date: date,
) -> EngineResult: ...

def evaluate_post_trade(
    *, env_id: str, fund_id: UUID, as_of_date: date,
) -> EngineResult: ...

def list_active_rules(
    *, env_id: str, fund_id: Optional[UUID], as_of_date: date,
) -> EngineResult: ...

def create_rule(*, env_id: str, business_id: UUID, rule: dict) -> EngineResult: ...
def deactivate_rule(*, env_id: str, rule_id: UUID, as_of: date) -> EngineResult: ...
```

Internal evaluator dispatchers — one per operator, pure functions:

```python
def _eval_max_pct_of_nav(rule: dict, ctx: EvalContext) -> Optional[Violation]: ...
def _eval_max_issuer_exposure(rule: dict, ctx: EvalContext) -> Optional[Violation]: ...
def _eval_max_sector_exposure_pct(rule: dict, ctx: EvalContext) -> Optional[Violation]: ...
def _eval_restricted_list(rule: dict, ctx: EvalContext) -> Optional[Violation]: ...
def _eval_mandate_min_pct(rule: dict, ctx: EvalContext) -> Optional[Violation]: ...
def _eval_mandate_max_pct(rule: dict, ctx: EvalContext) -> Optional[Violation]: ...

OPERATORS = {
    "max_pct_of_nav": _eval_max_pct_of_nav,
    ...
}
```

`EvalContext` is a frozen dataclass holding the position set, NAV, currency, and aggregated views (issuer totals, sector totals) so each evaluator runs in O(1) per rule.

Error codes:

| Code | Meaning |
|---|---|
| `invalid_rule_operator` | unknown operator on insert |
| `invalid_rule_predicate` | predicate keys don't match operator schema |
| `inactive_period` | rule active_to before active_from |
| `nav_unavailable` | post-trade evaluation needs NAV but it's missing |
| `position_set_unavailable` | can't load position set for as_of_date |

### Routes — extend `backend/app/routes/investment_engine.py`

```
POST /api/investment-engine/compliance/evaluate/pre-trade
POST /api/investment-engine/compliance/evaluate/post-trade

GET  /api/investment-engine/compliance/rules
POST /api/investment-engine/compliance/rules           (create)
POST /api/investment-engine/compliance/rules/{id}/deactivate

GET  /api/investment-engine/compliance/violations      (list, filterable)
POST /api/investment-engine/compliance/violations/{id}/resolve
```

### Frontend

Fifth tab: **Compliance**. Sub-tabs:

- **Rules** — list active rules for the env/fund; "+ New rule" form per operator (six operator-specific forms because each has different predicate keys); deactivate button.
- **Violations** — table filterable by severity / eval_kind / open/resolved. Resolve button opens a modal; submitting writes resolution metadata via the route. Same "Unavailable" treatment when data is missing.
- **Pre-trade tester** — hypothetical-trade form that posts to `/evaluate/pre-trade` and renders the violation set without persisting (dry-run).

### Tests

`backend/tests/test_compliance_engine.py`:

- One test per operator: in-tolerance and out-of-tolerance.
- Bi-temporal: rule with `active_to=2026-03-31` not picked up on 2026-04-01.
- Pre-trade hypothetical: a sell that would push concentration over 5% triggers; the same trade post-trade (after the position is reduced) doesn't.
- Append-only: violation UPDATE rejects on load-bearing fields; resolve metadata edits succeed.
- Rule rejection: unknown operator, missing predicate keys.
- Determinism: 50-run loop.

Playwright additions:

- Compliance tab: rule list renders, deactivate flow.
- Pre-trade tester: trade with restricted security shows critical violation.

---

## Wave 1 Verification Gate

Before declaring Wave 1 done, all of the following must be green:

1. **All Wave 0 tests still pass** (no regression).
2. **Risk module:**
   - Schema applied to prod (migrations 483 + factor/scenario seed).
   - 100% of risk_engine pure-compute golden tests pass to 6 decimals.
   - VaR pair (historical_sim + parametric) reproduces from `input_versions` after release.
   - HTTP smoke against live DB: 100% pass.
3. **Compliance module:**
   - Schema applied to prod (484, 485).
   - All six operators pass in-tolerance + out-of-tolerance tests.
   - Bi-temporal rule lookup correct.
   - Append-only on load-bearing fields enforced.
   - HTTP smoke against live DB: 100% pass.
4. **End-to-end check (cross-module):** a calculate_nav → calculate_var → evaluate_post_trade chain runs in sequence, all return `valid: true`, and the audit_log shows the expected `insert` rows for any persisted snapshots.
5. **Frontend:** Risk tab and Compliance tab render under the existing investment-engine page; Playwright tests pass.
6. **Deploy:** backend pushed to Railway, frontend pushed to Vercel, post-deploy curl smoke confirms each new endpoint returns `200` (or expected `422` on invalid input).

## Risks and Sharp Tradeoffs

**VaR golden tests must be ironclad.** A bad VaR is worse than no VaR. The two-asset textbook test is non-negotiable; any change to the math (e.g., switching to log returns, changing the EWMA default) must update the golden value with an explanation in the PR description, not just a re-run of the test.

**Factor library scope creep.** The starter set is five factors. Don't expand to ten before the first one is reproducing under the snapshot pattern — add factors only after the first runs reproduce byte-identically.

**Compliance evaluator contention.** Pre-trade is in OMS's hot path. Each rule evaluation must be O(1) given a pre-aggregated `EvalContext`. Building the context once per request and passing it to every rule is the win. Don't re-aggregate inside each evaluator.

**Rule DSL drift.** The fixed operator set is a feature. Resist requests to add a seventh operator without an ADR amendment, even if it's "just one more". The interpreter problem returns the moment that gate moves.

**Scenario shock vector mapping.** Scenarios are defined in factor space (`EQ.US`, `FI.US.10Y`); positions are in security space. The mapping requires `inv_factor_loading` to be populated for every held security. If loadings are missing, `apply_scenario` MUST fail-closed — don't run the scenario on partial coverage.

**Attribution math is subtle.** Brinson attribution vs. factor attribution vs. arithmetic vs. geometric. ADR amendment if we need anything beyond simple factor attribution; for V1.1 we ship the simplest correct version (factor exposure × factor return = factor contribution; sum to total) and document the assumption in the response payload.

**Schema migration count.** Wave 0 took 9 migrations. Wave 1 needs 5 (483 risk, 484 compliance core, 485 compliance seed, 486 factor seed, 487 scenario seed). Stay disciplined — one migration per logical unit; don't bundle.

## Parallelization Notes

Risk and compliance modules touch zero shared schema and zero shared service code. They can be built on parallel branches by parallel agents.

The shared surfaces:
- `backend/app/routes/investment_engine.py` — both modules append routes here. Merge conflicts are mechanical.
- `repo-b/src/app/lab/env/[envId]/investment-engine/page.tsx` — both add tabs. Same merge story.
- `repo-b/src/lib/bos-api.ts` — both add API client functions. Append-only; merge clean.

Strategy: build the modules on separate branches, merge to a `wave-1` integration branch, run the Wave 1 verification gate against integration, then merge to `main` for deploy.

## Time Estimate

- ADRs 004 + 005: already done (this session)
- Risk module: ~3–4 days focused build (schema + service + routes + golden tests)
- Compliance module: ~3 days (schema + service + routes + 6 operator tests)
- Frontend extensions: ~1 day (two tabs, sub-tabs)
- Verification gate: ~1 day (HTTP smoke, end-to-end chain, deploy + smoke)

Total Wave 1: ~7–9 calendar days if run in parallel; ~10–12 if serial.

## Immediate Next Steps for Claude Code

1. Read `docs/plans/INVESTMENT_ENGINE_PLAN.md` (parent plan) and confirm Wave 0 acceptance closed (memory file + verification report).
2. Read ADR 004 and ADR 005.
3. Read both skills: `winston-investment-engine-module` and `winston-investment-snapshot`.
4. Pick one module (recommend compliance first — unblocks Wave 2 OMS).
5. Author the per-module plan as `docs/plans/investment-engine/wave-1-{module}.md` with the same structure as Wave 0's `0-core-data-schema.md`.
6. Schema migration first. Apply via `mcp__supabase__apply_migration` (the `prepare_threshold=None` workaround is in scripts already; pooler URL works from any Vercel-pulled `backend/.env`).
7. Service second. Pure compute helpers + DB fetches + EngineResult shape; integration tests against the prod DB using the established runner pattern (see `/tmp/run_acct.py` style from Wave 0).
8. Routes third.
9. Frontend last.
10. Wave 1 verification gate before declaring done.

## What's NOT in Wave 1

- OMS (Wave 2) — order lifecycle, pre-trade routing
- EMS (Wave 2) — execution, allocations, settlement
- Workflow (Wave 2) — close cycles, exception queues
- Reporting (Wave 3) — investor statements, capital account statements
- Performance (TWR/IRR) — already partially in `accounting_engine.calculate_pnl` for V1; full TWR/IRR with cash-flow weighting is a Wave 1.5 enhancement, not a Wave 1 deliverable
- Monte Carlo VaR — deferred per ADR 004
- Open-ended rule operators — deferred per ADR 005
