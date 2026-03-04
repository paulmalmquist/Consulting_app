# Winston — Modeling Guardrails & Feature Design
*Codebase-referenced analysis based on repo-b / backend architecture*

---

## How to read this doc

For each pitfall, you'll find three things:
- **What you already have** — specific files and tables that already address this
- **The gap** — what's missing or underdeveloped
- **Specific guardrail** — the exact change, migration, or enforcement pattern to add

---

## 1. Model vs Reality Drift

### What you already have

`re_model_override` (`294_re_model_scope_override.sql`) stores:
```
model_id, scope_entity_type, scope_entity_id, field, decimal_value, reason, is_active
```

`re_provenance` tracks run lineage per scenario. `audit_events` logs every actor action with `object_id`, `action`, `input_json`. The `re_scenario_version` table creates immutable snapshots keyed by `assumptions_hash`.

### The gap

`re_model_override` does **not store `previous_value`**. When an override is replaced (via `set_override()` in `re_model.py`), the old value is silently lost. There is no UI surface that shows "this number was changed from X to Y by person Z for reason R" at the cell level.

### Guardrail

**Migration — add `previous_value` and `created_by` to the override table:**

```sql
-- Add to re_model_override
ALTER TABLE re_model_override
  ADD COLUMN previous_decimal_value NUMERIC(20,6),
  ADD COLUMN created_by UUID REFERENCES auth.users(id),
  ADD COLUMN override_version INTEGER NOT NULL DEFAULT 1;
```

**Service — in `set_override()` (`backend/app/services/re_model.py`), capture the old value before upserting:**

```python
# Before upsert, read existing value
existing = await get_override(model_id, scope_entity_id, field, conn)
previous_val = existing["decimal_value"] if existing else None

# Then write with previous_value populated
await conn.execute("""
    INSERT INTO re_model_override
      (model_id, scope_entity_type, scope_entity_id, field,
       decimal_value, previous_decimal_value, reason, created_by, override_version)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
      COALESCE((SELECT override_version FROM re_model_override
                WHERE model_id=$1 AND field=$4 AND scope_entity_id=$3), 0) + 1)
    ON CONFLICT ... DO UPDATE SET
      previous_decimal_value = EXCLUDED.decimal_value,
      decimal_value = $5, reason = $7, override_version = re_model_override.override_version + 1
""", ...)
```

**UI — every override cell should render an annotation chip:**

```
Exit Cap Rate    6.50%
                 ↑ Changed from 5.75%  ·  by PMalmquist  ·  "Stress test"  ·  Mar 4
```

This is the single most important thing for LP review credibility.

---

## 2. Cash Flow Logic Fragmentation

### What you already have

`scenario_engine.py` enforces: `NOI = revenue - expense`. `re_model_override` supports overriding individual fields including `revenue_growth`, `expense_growth`, *and* can store an NOI-direct override since any field name is accepted.

### The gap

There is no enforcement preventing someone from simultaneously overriding `revenue_growth` *and* setting a direct NOI value. The `_apply_overrides()` function in the scenario engine applies all overrides it finds — it doesn't check for conflicting levels. This means a user could set revenue growth, expense growth, and an NOI override simultaneously and produce an inconsistent model.

### Guardrail

**Add an edit mode concept to `re_model`:**

```sql
ALTER TABLE re_model
  ADD COLUMN cashflow_edit_mode TEXT NOT NULL DEFAULT 'simplified'
  CHECK (cashflow_edit_mode IN ('simplified', 'detailed'));
```

**Enforce in `set_override()` — raise a conflict error if modes are mixed:**

```python
SIMPLIFIED_FIELDS = {"noi_override", "noi_growth"}
DETAILED_FIELDS = {"revenue_growth", "expense_growth", "vacancy_rate"}

async def set_override(model_id, field, value, ...):
    model = await get_model(model_id)
    mode = model["cashflow_edit_mode"]

    if mode == "simplified" and field in DETAILED_FIELDS:
        raise ValueError(
            f"Field '{field}' requires detailed mode. "
            f"Switch cashflow_edit_mode to 'detailed' first."
        )
    if mode == "detailed" and field in SIMPLIFIED_FIELDS:
        raise ValueError(
            f"Field '{field}' is a simplified-mode override. "
            f"Clear revenue/expense overrides before switching."
        )
```

**UI — make this a visible toggle on the model page, not a hidden setting:**

```
Cash Flow Editing:   [ Simplified — NOI direct ]   [ Detailed — Revenue / Expense ]
                      Switch will clear conflicting overrides
```

When the user switches modes, the API should warn if existing overrides would be cleared and require confirmation.

---

## 3. Debt Schedule Breakage

### What you already have

`re_asset_quarter_state` stores `dscr`, `debt_balance`, `ltv`. `re_quarter_close.py` computes these per quarter. `re_model_override` supports `hold_period_years` as an override field.

### The gap

When `hold_period_years` is overridden in a model run, the debt maturity, IO period end, and refinance trigger dates are not automatically recomputed. The debt schedule appears to use the base asset's fixed debt inputs without re-deriving the covenant timeline. If someone drags the sale date (a future timeline feature), the DSCR covenant schedule will silently become wrong.

### Guardrail

**Add a debt assumption block to `re_model_override` or as a dedicated table:**

```sql
CREATE TABLE re_model_debt_assumption (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id        UUID NOT NULL REFERENCES re_model(id),
  asset_id        UUID NOT NULL REFERENCES repe_asset(id),
  rate            NUMERIC(8,5),
  amortization_years INTEGER,
  io_period_years INTEGER,
  maturity_date   DATE,
  refinance_year  INTEGER,
  prepayment_penalty_pct NUMERIC(8,5),
  is_locked       BOOLEAN NOT NULL DEFAULT FALSE,  -- if true, block manual cashflow edit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**In the scenario engine, add a debt recomputation step triggered by any hold_period or exit_date change:**

```python
def recompute_debt_schedule(asset_cf, debt_assumption, hold_years):
    """
    Re-derives DSCR, remaining balance, and maturity violations
    whenever hold period or NOI assumptions change.
    Returns: debt_cf dict with dscr_by_year, balloon_date, covenant_breach_years
    """
    # Never allow manual editing of this output
    # Always derive from (rate, amortization, io_period, maturity)
    ...
```

**UI — display a covenant alert if DSCR drops below threshold in any projection year:**

```
⚠ DSCR Covenant Breach
  Asset: Meridian Office Tower
  Year 2027: DSCR = 1.08  (covenant minimum: 1.25)
  Consider: adjust hold period or refinance assumption
```

This should be surfaced on the model run result page, not buried in logs.

---

## 4. Asset → Investment → Fund Rollup Errors

### What you already have

Three-tier quarterly state tables: `re_asset_quarter_state` → `re_investment_quarter_state` → `re_fund_quarter_state`. `waterfall_engine.py` handles LP/GP distributions. `re_jv` table tracks JV structures. `re_lineage.py` has `list_fund_investment_rollup()`.

### The gap

The rollup in `re_quarter_close.py` aggregates investment NAV contributions to fund level, but there is no explicit JV ownership-weighting step visible in the service layer. If an asset is held through a JV at 70% ownership, the asset-level cashflows must be multiplied by the ownership fraction *before* being added to the investment's cashflows. If this step is implicit or missing, fund IRR will be correct only for wholly-owned assets.

### Guardrail

**Add an ownership registry table that the rollup engine reads explicitly:**

```sql
CREATE TABLE re_investment_asset_ownership (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id     UUID NOT NULL REFERENCES repe_deal(id),
  asset_id          UUID NOT NULL REFERENCES repe_asset(id),
  ownership_pct     NUMERIC(6,4) NOT NULL CHECK (ownership_pct BETWEEN 0 AND 1),
  effective_date    DATE NOT NULL,
  structure_type    TEXT CHECK (structure_type IN ('direct', 'jv', 'preferred_equity', 'mezzanine')),
  promote_threshold NUMERIC(20,2),  -- if preferred equity / promote
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**In the rollup engine, make the ownership step explicit and logged:**

```python
def roll_asset_to_investment(asset_cf, ownership_pct, structure_type):
    """
    Explicit ownership-weighted rollup.
    This function must be called for EVERY asset, even wholly-owned (pct=1.0).
    Making it explicit means the log always shows the multiplier used.
    """
    return {
        "noi":         asset_cf["noi"] * ownership_pct,
        "asset_value": asset_cf["asset_value"] * ownership_pct,
        "debt":        asset_cf["debt"] * ownership_pct,
        "nav":         asset_cf["nav"] * ownership_pct,
        "_ownership_pct_applied": ownership_pct,   # always log this
        "_structure_type": structure_type,
    }
```

**Add an integrity check endpoint** (extend the existing `/api/re/v2/integrity/budget`):

```
GET /api/re/v2/integrity/rollup?modelId=...

Returns:
{
  "asset_irr_sum":       18.2%,
  "fund_irr":            16.1%,
  "ownership_gap_check": "PASS",    // fund IRR < asset IRR as expected
  "jv_assets_flagged":  ["asset_id_x"]  // assets with <100% ownership
}
```

---

## 5. Multiple Models Editing the Same Asset

### What you already have

This is actually **handled correctly by your architecture**. `re_model_override` is model-scoped. `_sync_model_overrides_to_scenario()` writes to `re_assumption_override` (scenario-scoped), never to `repe_asset` base tables. Base asset data lives in `repe_property_asset` and is read-only during model runs.

### The remaining risk

The sync function in `re_model_run.py` **clears all existing scenario overrides** before applying the model's overrides:

```python
# Current pattern (paraphrased from re_model_run.py)
await conn.execute("DELETE FROM re_assumption_override WHERE scenario_id = $1", scenario_id)
# then re-insert from model overrides
```

If two model runs execute concurrently against the same scenario, one run's DELETE can race with another's INSERT, silently dropping overrides. The scenario becomes a shared mutable object between runs.

### Guardrail

**Make each model run write to a versioned scenario snapshot rather than the live scenario:**

The `re_scenario_version` table already exists for this purpose. Enforce that all run output is written to a new version row, never patching the live scenario directly:

```python
async def execute_model_run(model_id, run_id, conn):
    # Create immutable version snapshot BEFORE applying overrides
    version_id = await create_scenario_version(
        scenario_id=scenario_id,
        model_run_id=run_id,
        triggered_by=actor_id,
        conn=conn
    )
    # All override application writes to version_id, not scenario_id
    # The live scenario is never mutated during a run
    await apply_overrides_to_version(version_id, overrides, conn)
```

**Add a concurrency guard on the model:**

```sql
ALTER TABLE re_model ADD COLUMN run_lock_expires_at TIMESTAMPTZ;
```

```python
# Acquire lock before run, release after
async def acquire_model_run_lock(model_id, ttl_seconds=300, conn):
    result = await conn.fetchrow("""
        UPDATE re_model
        SET run_lock_expires_at = now() + interval '1 second' * $2
        WHERE id = $1
          AND (run_lock_expires_at IS NULL OR run_lock_expires_at < now())
        RETURNING id
    """, model_id, ttl_seconds)
    if not result:
        raise ConcurrentRunError("Model is currently being run. Try again shortly.")
```

---

## 6. Asset Selection Explosion / Scope Clarity

### What you already have

`re_model_scope` table exists and is well-designed, with `scope_entity_type` (asset/investment/jv/fund) and `scope_entity_id`.

### The gap

The model detail page in the frontend does not appear to render an **aggregate scope summary** — something that tells the user "you are modeling 7 assets across 3 funds representing $318M NAV." Without this, a user who adds assets from multiple unrelated funds won't realize they've built a hypothetical portfolio.

### Guardrail

**Add a scope summary computed field to the model run result:**

```python
# In re_model_run.py, compute and persist scope summary after run
async def compute_scope_summary(model_id, conn) -> dict:
    rows = await conn.fetch("""
        SELECT
          COUNT(DISTINCT a.id)        AS asset_count,
          COUNT(DISTINCT d.fund_id)   AS fund_count,
          COUNT(DISTINCT s.scope_entity_id) FILTER (WHERE s.scope_entity_type = 'investment') AS investment_count,
          SUM(aq.nav)                 AS total_nav
        FROM re_model_scope s
        JOIN repe_asset a ON a.id = s.scope_entity_id
        JOIN repe_deal d ON d.id = a.deal_id
        JOIN re_asset_quarter_state aq ON aq.asset_id = a.id AND aq.is_latest = TRUE
        WHERE s.model_id = $1
    """, model_id)
    return dict(rows[0])
```

**UI — display prominently at the top of every model page:**

```
┌─────────────────────────────────────────────────────┐
│  Model Scope                                         │
│  7 assets  ·  4 investments  ·  3 funds  ·  $318M NAV │
│  ⚠ Assets from multiple funds — cross-fund model    │
└─────────────────────────────────────────────────────┘
```

The warning on the last line is important — it's not always wrong to model across funds, but the user should know they've done it.

---

## 7. Performance / Async Architecture

### What you already have

This is genuinely strong. You have Celery for async task execution, the orchestration engine with worktree isolation, and `re_model_monte_carlo.py` running simulations as background jobs. The frontend polls run status rather than blocking. This is the right architecture.

### The remaining risk

Monte Carlo result storage (`re_model_mc_result`) stores summary statistics (mean_irr, std_irr, var_95, etc.) but not the **full simulation path data**. For 1,000 paths across 15 years and 20 assets, you'd need 300,000 row-years. If you ever want to show distribution curves or path-level fan charts in the UI, you'll need to store the percentile bands at minimum.

### Guardrail

**Add a percentile band table alongside the summary results:**

```sql
CREATE TABLE re_model_mc_percentile_band (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mc_run_id   UUID NOT NULL REFERENCES re_model_mc_run(id),
  entity_type TEXT NOT NULL,  -- fund, investment, asset
  entity_id   UUID NOT NULL,
  year        INTEGER NOT NULL,
  metric      TEXT NOT NULL,  -- irr, moic, noi, nav
  p10         NUMERIC(20,6),
  p25         NUMERIC(20,6),
  p50         NUMERIC(20,6),
  p75         NUMERIC(20,6),
  p90         NUMERIC(20,6),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

This table stays manageable: 15 years × 20 assets × ~8 metrics = 2,400 rows per run. The full 300k path simulation stays in memory and is never persisted — only bands are written. The UI can render fan charts from these bands without re-running the simulation.

**Hard rule:** Never expose a Monte Carlo trigger button in the UI that is synchronous. The button should dispatch a job and return a `run_id`. The UI polls `/api/re/v2/models/[modelId]/monte-carlo/[runId]/status`. If this rule is ever violated during a refactor, the UI will appear to hang.

---

## 8. Time Horizon Misalignment

### What you already have

`re_asset_quarter_state` uses a `quarter` field (presumably `YYYY-QN` format). `re_asset_operating_qtr` likewise tracks by quarter. This is already calendar-aligned, which is correct.

### The gap

The model override system uses `hold_period_years` as an integer offset (e.g., "hold for 7 years") rather than an absolute exit date. If Asset A was acquired in Q1 2020 and Asset B in Q3 2024, "hold_period_years = 7" produces a 2027 exit for A and a 2031 exit for B — which is correct. But if the override is written as a shared fund-level override (scope_entity_type = 'fund'), all assets in that fund get the same hold_period, which forces the same absolute exit year regardless of acquisition date. This is almost always wrong for a diversified fund.

### Guardrail

**Add validation in `set_override()` that warns when a `hold_period_years` override is applied at fund level:**

```python
FUND_LEVEL_OVERRIDE_WARNINGS = {
    "hold_period_years": (
        "Applying hold_period_years at fund level uses the same duration "
        "for all assets regardless of acquisition date. "
        "Consider asset-level overrides for precise exit timing."
    ),
    "exit_cap_rate": None,  # fund-level cap rate override is fine
}

async def set_override(model_id, scope_entity_type, field, value, ...):
    if scope_entity_type == "fund" and field in FUND_LEVEL_OVERRIDE_WARNINGS:
        warning = FUND_LEVEL_OVERRIDE_WARNINGS[field]
        if warning:
            # Return a warning alongside the successful write
            return {"status": "ok", "warning": warning}
```

**For the timeline drag feature (when you build it):** store exit_date as an **absolute calendar date** per asset, not as a relative offset. The relative offset is a convenience input only — store the resolved date.

---

## 9. UI Complexity / Progressive Disclosure

### What you already have

The model detail page in `repo-b/src/app/lab/env/[envId]/re/models/[modelId]/page.tsx` manages scope, overrides, and run status. The REPE fund dashboard has multiple department sub-pages (Revenue, Cash, Risk, Compliance, Project Health).

### The gap

There is no explicit progressive disclosure pattern in the modeling UI. All override fields are presumably shown together, which will overwhelm non-analyst users (LPs, asset managers, executives reviewing models).

### Guardrail

**Define three disclosure levels as a frontend constant and drive field rendering from it:**

```typescript
// In a shared constants file
export const CF_DISCLOSURE_LEVELS = {
  EXECUTIVE: {
    label: "Summary",
    fields: ["exit_cap_rate", "hold_period_years", "discount_rate"],
    description: "Exit assumptions only"
  },
  ANALYST: {
    label: "Standard",
    fields: ["revenue_growth", "expense_growth", "vacancy_rate", "exit_cap_rate",
             "hold_period_years", "discount_rate", "capex_reserve"],
    description: "Revenue, expenses, exit"
  },
  DETAILED: {
    label: "Full Model",
    fields: "__all__",
    description: "All override fields including debt and lease assumptions"
  }
}
```

**Store the selected level on the model, not just in local UI state:**

```sql
ALTER TABLE re_model ADD COLUMN ui_disclosure_level TEXT NOT NULL DEFAULT 'ANALYST'
  CHECK (ui_disclosure_level IN ('EXECUTIVE', 'ANALYST', 'DETAILED'));
```

This matters because IC memos and LP reports should always render at EXECUTIVE level regardless of who built the model. The disclosure level becomes part of the model configuration, not a UI preference.

---

## 10. Model Versioning

### What you already have

`re_scenario_version` creates immutable snapshots keyed by `assumptions_hash`. `re_model_run` (via `re_provenance`) links each run to a scenario version. The `re_model` table has `status` and `created_at`.

### The gap

There is no user-visible version label or semantic version number. When an analyst asks "which version of the model did the IC memo use?", the answer is currently an opaque UUID. The `re_scenario_version` table doesn't appear to have a human-readable label or tag.

### Guardrail

**Add version tagging to `re_scenario_version`:**

```sql
ALTER TABLE re_scenario_version
  ADD COLUMN version_label TEXT,           -- e.g. "IC Submission v2", "Base Case March 4"
  ADD COLUMN pinned_at TIMESTAMPTZ,        -- non-null = locked / immutable
  ADD COLUMN pinned_by UUID REFERENCES auth.users(id),
  ADD COLUMN memo_reference TEXT;          -- e.g. "IC Memo 2026-Q1"
```

**Add a pin action to the API:**

```
POST /api/re/v2/models/[modelId]/versions/[versionId]/pin
Body: { "label": "IC Submission v2", "memo_reference": "IC Memo 2026-Q1" }
```

Pinned versions become permanently immutable — no further overrides or reruns can mutate them. This is the audit guarantee that institutional investors require.

**UI — version history panel on the model page:**

```
Version History
──────────────────────────────────────────────
📌 IC Submission v2    Mar 4, 2026    PMalmquist
   Base Case March     Feb 28, 2026   PMalmquist
   Initial Model       Feb 10, 2026   PMalmquist
```

---

## 11. Cash Flow vs Valuation Confusion

### What you already have

`re_asset_quarter_state` stores both `asset_value` (derived from cap rate / NOI) and `net_cash_flow`. IRR is computed in `irr_engine.py` using both distributions and exit proceeds.

### The gap

There is no UI indicator that shows the *source* of value change when the two drivers (NOI vs exit cap) move independently. If exit cap is overridden downward but NOI is unchanged, asset value increases with no cashflow change — which looks like free money and is confusing without context.

### Guardrail

**Compute and surface a value attribution breakdown alongside every model result:**

```python
def compute_value_attribution(base_result, model_result):
    """
    Decomposes NAV change into its drivers.
    Call this after every model run and persist to re_model_run_attribution.
    """
    noi_contribution = (
        (model_result["noi"] - base_result["noi"]) / base_result["exit_cap_rate"]
    )
    cap_rate_contribution = (
        base_result["noi"] * (1/model_result["exit_cap_rate"] - 1/base_result["exit_cap_rate"])
    )
    return {
        "total_value_change":      model_result["asset_value"] - base_result["asset_value"],
        "from_noi_change":         noi_contribution,
        "from_cap_rate_change":    cap_rate_contribution,
    }
```

**UI — show a simple breakdown card on every asset result:**

```
Value Change vs Base
────────────────────
NOI unchanged        $0
Exit cap  5.75%→5.25%  +$2.4M   ← 100% of value increase
────────────────────
Total                +$2.4M
```

This makes it obvious when value is coming from multiple expansion (cap rate compression) vs actual operational improvement.

---

## 12. Scenario Comparison

### What you already have

`re_model_scenarios` supports multiple scenarios per model. `re_waterfall_scenario.py` runs scenarios. The frontend has a scenario comparison component under the model page.

### The gap

Scenario comparison appears to exist but is not yet wired to the return attribution breakdown described above. The comparison table presumably shows raw IRR/MOIC numbers without explaining *why* they differ.

### Guardrail

**For each scenario pair, compute a diff table automatically:**

```python
async def compare_scenarios(model_id, scenario_a_id, scenario_b_id, conn):
    """Returns side-by-side metrics AND a driver diff table."""
    a = await get_scenario_result(scenario_a_id, conn)
    b = await get_scenario_result(scenario_b_id, conn)

    return {
        "metrics": {
            "irr":           {"a": a["irr"], "b": b["irr"], "delta": b["irr"] - a["irr"]},
            "equity_multiple":{"a": a["moic"], "b": b["moic"], "delta": b["moic"] - a["moic"]},
            "profit":        {"a": a["profit"], "b": b["profit"], "delta": b["profit"] - a["profit"]},
        },
        "drivers": compute_value_attribution(a, b),   # reuse attribution logic
        "override_diffs": await get_override_diff(scenario_a_id, scenario_b_id, conn),
    }
```

**UI target (minimum viable comparison table):**

```
                   Base Case    Stress      Delta
─────────────────────────────────────────────────
IRR                16.2%        13.5%       -2.7%
Equity Multiple    1.82×        1.61×       -0.21×
Profit             $24.1M       $18.7M      -$5.4M
─────────────────────────────────────────────────
Key drivers:
  NOI stress (-15%)            -1.3%
  Cap rate expansion (+50bps)  -0.8%
  Hold period (+2yr)           -0.6%
```

---

## 13. Monte Carlo Input Definition

### What you already have

`re_monte_carlo.py` accepts `distribution_params` with fields for `rent_growth`, `expense_growth`, `cap_rate`, `vacancy_shock`. Defaults are hardcoded (2%, 3%, 5.5%). The model-level Monte Carlo in `re_model_monte_carlo.py` stores `distribution_params_json`.

### The gap

The current implementation samples all variables as independent draws. In reality, cap rate and rent growth are correlated (both driven by macro conditions). Treating them as independent underestimates tail risk in correlated stress scenarios (e.g., rising rates simultaneously compress NOI and expand cap rates). There's also no UI for defining which variables are stochastic vs fixed for a given run.

### Guardrail

**Add a correlation structure to the Monte Carlo input schema:**

```python
DEFAULT_MC_PARAMS = {
    "variables": {
        "rent_growth":    {"distribution": "normal", "mean": 0.02, "std": 0.015, "is_stochastic": True},
        "expense_growth": {"distribution": "normal", "mean": 0.03, "std": 0.010, "is_stochastic": True},
        "exit_cap_rate":  {"distribution": "normal", "mean": 0.055,"std": 0.008, "is_stochastic": True},
        "vacancy_shock":  {"distribution": "bernoulli", "p": 0.10, "shock_size": 0.15, "is_stochastic": True},
        "hold_years":     {"distribution": "discrete", "values": [5,7,10], "weights": [0.3,0.5,0.2], "is_stochastic": False},
    },
    "correlations": {
        # Positive correlation: when rates rise, cap rates expand and rent growth slows
        ("rent_growth", "exit_cap_rate"): -0.45,
        ("rent_growth", "expense_growth"): 0.30,
    }
}
```

**Use Cholesky decomposition to enforce correlations in the sampler** — this is a ~10 line addition to the existing NumPy simulation loop and meaningfully improves the quality of tail scenarios.

**UI — show a plain-English summary of what's being simulated before the user runs it:**

```
Monte Carlo Configuration
──────────────────────────
Stochastic:  Rent growth, Expense growth, Exit cap rate, Vacancy shock
Fixed:       Hold period (7 years), Debt terms
Paths:       1,000
Correlation: Rent growth ↔ Cap rate (-0.45)

[ Run Simulation ]
```

---

## 14. The "Explain Results" Feature (Highest Impact)

This is the single feature that would most differentiate Winston from a spreadsheet model. ChatGPT's recommendation to build an "Explain IRR" button is correct — and your architecture already has everything needed to implement it.

### Implementation using your existing stack

**Step 1 — Run baseline + individual overrides separately (already partially done in scenario engine):**

```python
async def decompose_irr_drivers(model_id, conn):
    overrides = await list_model_overrides(model_id, conn)
    baseline_irr = await run_without_overrides(model_id, conn)

    drivers = []
    for override in overrides:
        # Run model with ONLY this one override applied
        isolated_irr = await run_with_single_override(model_id, override, conn)
        drivers.append({
            "field":       override["field"],
            "entity":      override["scope_entity_id"],
            "irr_impact":  isolated_irr - baseline_irr,
            "old_value":   override["previous_decimal_value"],
            "new_value":   override["decimal_value"],
            "reason":      override["reason"],
        })

    return sorted(drivers, key=lambda x: abs(x["irr_impact"]), reverse=True)
```

**Step 2 — Persist the decomposition with the run result:**

```sql
CREATE TABLE re_model_run_attribution (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_run_id    UUID NOT NULL REFERENCES re_provenance(id),
  field           TEXT NOT NULL,
  entity_id       UUID,
  irr_impact      NUMERIC(8,5),
  value_impact    NUMERIC(20,2),
  old_value       NUMERIC(20,6),
  new_value       NUMERIC(20,6),
  reason          TEXT,
  rank            INTEGER  -- ordered by absolute impact
);
```

**Step 3 — UI bar chart on the run result page:**

```
Return Drivers — IRR Change vs Base Case (16.2%)
─────────────────────────────────────────────────
NOI stress (Meridian)     ████████ -1.3%   "Lease rollover stress"
Exit cap expansion        ██████   -0.8%   "Market repricing"
Hold period +2yr          ████     -0.6%   "Debt maturity constraint"
Debt refi assumption      ██       +0.3%   "Lower refi rate"
─────────────────────────────────────────────────
Net IRR                            13.8%
```

This single feature will make every IC presentation and LP review conversation significantly easier.

---

## 15. Document-Aware Underwriting (The RAG Gap)

### Current state

Documents are uploaded and stored (Supabase Storage), entity-linked (`document_entity_links`), and accessible via signed URL. **However, the codebase has no vector embedding pipeline, no chunking service, and no semantic search.** The RAG Chat UI exists as a frontend stub but the backend has no retrieval engine behind it.

### What to build

This is a separate project, but the architecture is clear:

1. **On document upload** (`complete_upload()` in `documents.py`): dispatch a background job to extract text, chunk it (~500 token overlapping chunks), and embed via OpenAI/Anthropic embeddings API
2. **Store in pgvector**: add `vector(1536)` column to a `document_chunks` table
3. **RAG retrieval**: on chat query, embed the question, cosine-similarity search against chunks scoped to the current environment, return top-k as context
4. **Model bootstrapping**: when a user uploads an OM or rent roll, run a structured extraction pipeline (not just RAG — use function calling to extract `in_place_noi`, `loan_amount`, `maturity_date`, etc.) and propose a model override prefill

The "evidence-linked assumptions" feature (click Exit Cap to see the appraisal page it came from) requires storing `chunk_id` alongside the proposed override. This is the feature that no legacy system can replicate.

---

## Priority Order

Given where the codebase stands today:

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 1 | `previous_value` on overrides + UI annotation | Low | LP credibility |
| 2 | `cashflow_edit_mode` guard (simplified vs detailed) | Low | Model integrity |
| 3 | Version pinning with labels | Low | Audit compliance |
| 4 | Scope summary display on model page | Low | UX clarity |
| 5 | `re_model_run_attribution` + "Explain IRR" UI | Medium | Differentiator |
| 6 | Debt assumption recomputation on hold period change | Medium | Financial accuracy |
| 7 | Ownership registry + explicit rollup logging | Medium | Fund IRR accuracy |
| 8 | Monte Carlo percentile bands + correlation | Medium | Risk quality |
| 9 | Progressive disclosure levels | Medium | UX |
| 10 | RAG / document-aware underwriting | High | Strategic advantage |

Items 1–4 are database migrations + small service changes. Item 5 is the one that makes Winston feel intelligent rather than mechanical. Items 6–9 are correctness improvements. Item 10 is the moat.
