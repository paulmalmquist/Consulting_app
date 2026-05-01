# ADR 004 — Value at Risk (VaR) Method

- **Status:** Accepted
- **Date:** 2026-04-30
- **Deciders:** Paul (owner), Investment Engine architecture
- **Supersedes:** —
- **Superseded by:** —
- **Related:** ADR 002 (currency), ADR 003 (bi-temporal), `docs/plans/investment-engine/wave-1-plan.md`

## Context

The risk engine must produce VaR for portfolios and funds at a defined confidence level (default 95% one-day) so investors and risk managers can size exposure. Three standard methods exist:

1. **Historical simulation.** Apply N days of past returns to the current portfolio; the loss at the chosen percentile is the VaR. No distributional assumptions; captures fat tails when they're in the historical window. Sensitive to window length and calendar effects (e.g., last March missing a crisis vs including one).
2. **Parametric (variance-covariance).** Assume a multivariate-normal return distribution; VaR = z-score × portfolio σ. Fast; analytically clean; underestimates tails when returns are non-normal (which is most of the time at the percentile we care about).
3. **Monte Carlo.** Simulate N draws from a calibrated distribution (or a copula). Most flexible; most expensive; the "right" answer is bounded by the calibration quality.

Choosing one and rejecting the others is the wrong move. Historical and parametric disagree often, and the disagreement itself is informative — it surfaces non-normality and regime shifts. Monte Carlo adds engineering surface area without obvious near-term ROI.

A second decision: how is the result audited? Every VaR figure must carry the method that produced it, the inputs that fed it (positions, price history, factor matrix), and the parameters (confidence level, holding period, history window).

## Decision

**Compute and store both historical-sim and parametric VaR. Monte Carlo is out of scope for V1.1; revisit when a fund mandate requires it.**

1. **`var_method`** is a required column on every risk snapshot row, with values `historical_sim` or `parametric`. No nullable; no default.

2. **Both methods run on every VaR request.** A single call to `calculate_var(...)` returns one EngineResult whose `value` contains:
   ```python
   {
     "as_of_date": date,
     "horizon_days": int,
     "confidence_pct": Decimal,    # 95.00, 99.00, etc.
     "currency": str,               # base currency
     "portfolio_value": Decimal,
     "var_historical_sim": Decimal,
     "var_parametric": Decimal,
     "method_inputs": {
       "history_window_days": int,
       "covariance_method": str,    # "sample", "ewma_lambda_0_94", etc.
     }
   }
   ```
   Two persisted snapshot rows are written, one per method, sharing `correlation_id` and `effective_date` so the audit trail can pair them.

3. **Confidence and horizon are explicit, not default-baked.** Inputs:
   - `confidence_pct` ∈ {95, 97.5, 99} (CHECK constraint)
   - `horizon_days` ∈ {1, 5, 10, 20} (CHECK constraint)
   The pair (confidence, horizon) is included in the row's natural key so multiple VaR figures coexist for the same fund and effective_date.

4. **History window is fund-configurable, defaulting to 252 trading days (~1y).** Stored on the snapshot. Operations can override per-run via a request param.

5. **Parametric covariance uses sample covariance with optional EWMA decay.** EWMA lambda is fund-configurable, defaulting to 0.94 (RiskMetrics standard). Covariance method recorded on the snapshot.

6. **Historical-sim mode uses unscaled empirical returns.** No bootstrapping in V1.1. Bootstrap can be a v2 enhancement if return-window scarcity becomes a real problem (it isn't at 252 days).

7. **Fail-closed inputs.** Missing price history for ANY position forces `valid=false` with `code=missing_history`. No interpolation, no padding. The risk number must be answerable for every position or the whole calculation rejects.

8. **Golden tests are non-negotiable.** A two-asset fixed portfolio with a known covariance matrix must produce the textbook parametric VaR to 6 decimals. A historical sim against a known returns matrix must produce the textbook empirical-quantile loss. CI fails on drift.

## Consequences

### Positive

- Two-method storage surfaces method disagreement automatically. The UI can show both numbers; large gaps page risk.
- Audit story: every figure has a method tag, an input set, and (because Wave 0 already shipped the snapshot pattern) is reproducible from `input_versions`.
- Performance: parametric is O(N²) on positions for the covariance multiplication, historical sim is O(N × history); both fit comfortably in a single Postgres trip + Python compute. No external service required.
- Confidence/horizon explicit in the natural key — no risk of "is this the 95% or the 99%" ambiguity downstream.

### Negative

- Two persistence rows per VaR call. Snapshot table size grows 2× vs single-method storage. Mitigated by partitioning per the Wave 0 pattern.
- Method disagreement in normal markets can mislead users who assume the numbers should agree. UI must show the method tag prominently and flag large gaps.
- Historical sim is biased by the window. A fund onboarded in March 2026 might have no 2020-style stress in its 252-day window. Operations needs to know this and either override the window or run scenario analysis (separate function, not VaR).

### Neutral

- Adds a `var_method` column and minor payload columns to `inv_risk_snapshot`. Schema impact small.

## Alternatives Considered

**Single method (parametric only).** Rejected. Faster but materially understates tail risk. Gives risk managers false comfort.

**Single method (historical sim only).** Rejected. Better tails, but window-sensitivity surprises are real. The parametric number is a useful sanity check.

**Monte Carlo as a third method.** Deferred. Adds a calibration surface (correlation matrix, marginal distributions, copula choice) that's significant work for unclear V1.1 benefit. Revisit when a fund requires it.

**Compute one method on demand, the other lazily.** Rejected. Adds complexity without value — both are fast enough that running both inline is fine.

**Fund-level confidence/horizon defaults stored on `inv_fund`.** Considered; rejected for V1.1. Operations sets confidence/horizon per-call so audit-time inspection is unambiguous. Defaults can move to `inv_fund` later if every fund stops varying them.

## Implementation Notes

Schema columns added to `inv_risk_snapshot` (defined in migration 483):

| Column | Type | Notes |
|---|---|---|
| `var_method` | text NOT NULL CHECK IN ('historical_sim','parametric') | required |
| `confidence_pct` | numeric(5,2) NOT NULL CHECK | 95.00, 97.50, 99.00 |
| `horizon_days` | int NOT NULL CHECK IN (1,5,10,20) | |
| `history_window_days` | int NOT NULL | typically 252 |
| `covariance_method` | text | parametric only; `sample` \| `ewma_<lambda>` |
| `var_native` | numeric(28,8) NOT NULL | the loss figure |
| `var_currency` | char(3) NOT NULL | |
| `portfolio_value_native` | numeric(28,8) NOT NULL | for context |

Service signature in `backend/app/services/risk_engine.py`:

```python
def calculate_var(
    *,
    env_id: str,
    fund_id: UUID,
    as_of_date: date,
    confidence_pct: Decimal = Decimal("95.00"),
    horizon_days: int = 1,
    history_window_days: int = 252,
    ewma_lambda: Optional[Decimal] = None,
) -> EngineResult: ...
```

Returns the dual-method response shape from §2 above. Caller persists via `produce_var_snapshot(...)` (which writes two rows in one transaction).

## Verification

- Unit test: parametric VaR for two-asset portfolio with covariance Σ matches textbook formula `z_score × sqrt(w'Σw)` to 6 decimals.
- Unit test: historical sim VaR against a known returns matrix matches the empirical (1−p) percentile loss exactly.
- Unit test: missing price history on any constituent → `valid=false`, `code=missing_history`.
- Unit test: two-method snapshot pair shares `correlation_id` and `effective_date`.
- Replay test: snapshot reconstruct returns equal payload on the same input set.
- Drift test: nightly job samples N released risk snapshots and runs reconstruct; divergence pages oncall.
- Determinism test: 50 reruns of `calculate_var` on the same inputs produce identical Decimal output.
