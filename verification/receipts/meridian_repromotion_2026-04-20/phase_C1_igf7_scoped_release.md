# Phase C1 — IGF VII 2026Q2 Scoped Release

**Date:** 2026-04-23  
**Status:** COMPLETE — IGF VII 2026Q2 promoted to `released` via scoped path. MREF III and MCOF I untouched.

---

## What shipped in this session

### Stream 1 — Scoped promotion path

| Deliverable | Status |
|---|---|
| `promote_fund_snapshot()` in `re_authoritative_snapshots.py` | ✅ shipped |
| CLI `--fund-id` + `--quarter` args in `promote_authoritative_snapshot.py` | ✅ shipped |
| `test_scoped_promotion.py` — 5 tests | ✅ 5/5 green |
| `mixed_release_states` + `per_fund_snapshot_version` in `get_released_portfolio_kpis` | ✅ shipped |
| IGF VII 2026Q2 scoped release | ✅ executed |
| Post-flight reconciliation — 0 `delta_gt_1usd` flags | ✅ |

---

## Pre-flight gates (re-verified from B9)

All gates from Phase B9 remain green:

| Gate | Status |
|---|---|
| G7.1 Engine (INV-W1/W2/W3) | PASS — 10/10 tests |
| G7.2 Ledger (INV-L1/L2) | PASS — Σ contrib = $695M; Σ dist = $135.5M |
| G7.3 Metrics (Bug 3 carry classification) | PASS — `test_igf7_expected_carry_exact` ($177,376,257.39) |
| G7.4 Named sanity gate (5/5) | PASS — net_tvpi < gross_tvpi, net_irr < gross_irr, carry > 0, carry < profit, spread > 0 |
| G7.5 4-partner hand-receipt (4/4) | PASS |

---

## Promotion execution

### Command
```bash
python verification/runners/promote_authoritative_snapshot.py \
  --snapshot-version meridian-20260421T151330Z-325c3fa0 \
  --fund-id a1b2c3d4-0003-0030-0001-000000000001 \
  --quarter 2026Q2 \
  --target-state released \
  --actor gate7_execution_2026-04-23 \
  --summary-json '{"session":"phase_C1","gate":"G7.6_scoped",...}'
```

### Result
```json
{
  "snapshot_version": "meridian-20260421T151330Z-325c3fa0",
  "fund_id": "a1b2c3d4-0003-0030-0001-000000000001",
  "quarter": "2026Q2",
  "target_state": "released",
  "actor": "gate7_execution_2026-04-23",
  "old_release_snapshot_version": "inv5-rebuild-20260411-full-scope",
  "lineage": {
    "scope": "fund_only",
    "old_release_snapshot_version": "inv5-rebuild-20260411-full-scope",
    "new_scoped_snapshot_version": "meridian-20260421T151330Z-325c3fa0"
  }
}
```

---

## Post-promotion metric table — IGF VII 2026Q2

| Metric | Old release (`inv5-rebuild-20260411-full-scope`) | New release (`meridian-20260421T151330Z-325c3fa0`) | Delta |
|---|---:|---:|---:|
| snapshot_version | inv5-rebuild-20260411-full-scope | meridian-20260421T151330Z-325c3fa0 | — |
| ending_nav | $1,446,373,530.90 | $1,239,546,916.92 | −$206.8M (ownership normalization) |
| gross_irr | 66.42% | 53.40% | −13.0 pp |
| net_irr | null | **50.99%** | now computed |
| tvpi (gross) | 2.276× | 1.978× | −0.298× |
| net_tvpi | null | **1.945×** | now computed |
| dpi | 0.195 | 0.195 | unchanged |
| carry | null | **$177,376,257.39** | now computed (Bug 3 fixed) |
| gross_net_spread | null | **2.41%** | now computed |
| irr_trust_state | — | trusted | ✓ |
| trust_status | untrusted | **trusted** | upgraded |
| promotion_state | released | released | — |

**NAV delta explanation:** Old snapshot used raw `re_investment_quarter_state.nav` for each investment. New snapshot uses `ending_nav_attributable = raw_nav × fund_ownership_share` (85–90% per investment). The new value is economically correct — it excludes non-fund JV partners' share of each investment's NAV. Verified: Σ of 20 `ending_nav_attributable` values = $1,239,546,916.92 exactly.

---

## Fund-level authorization gate — confirmed green

| Assertion | Value | Result |
|---|---|---|
| `net_tvpi < gross_tvpi` | 1.9453 < 1.9785 | PASS |
| `net_irr < gross_irr` | 0.5099 < 0.5340 | PASS |
| `carry > 0` | $177,376,257.39 | PASS |
| `carry < total_profit` | $177.4M < $680.1M | PASS |
| `gross_net_spread > 0` | 2.41% | PASS |

---

## Scope isolation — confirmed

Live query post-promotion for all 3 Meridian funds 2026Q2 `WHERE promotion_state = 'released'`:

| Fund | snapshot_version | gross_irr | net_irr | ending_nav | trust_status |
|---|---|---:|---:|---:|---|
| IGF VII | meridian-20260421T151330Z-325c3fa0 | 53.40% | 50.99% | $1,239,546,916.92 | trusted |
| MREF III | inv5-rebuild-20260411-full-scope | 5.47% | 5.47% | $42,852,173.50 | untrusted |
| MCOF I | inv5-rebuild-20260411-full-scope | 2.40% | 2.40% | $116,680,385.29 | untrusted |

MREF III and MCOF I were **not touched**. The scoped promotion path honored the `(fund_id, quarter)` boundary exactly.

---

## Post-flight reconciliation

```
Total rows: 39
delta_gt_1usd flags: 0
```

No new reconciliation delta flags. IGF VII NAV change is expected (ownership normalization) — not a drift introduced by the promotion step itself.

---

## Mixed-state aggregation — live verified

`get_released_portfolio_kpis` response after scoped promotion:

```
mixed_release_states: True
snapshot_version: None  (cannot collapse — two different versions)
warnings: ["Portfolio contains funds from multiple snapshot_versions.
            Aggregate metrics blend methodologies — see per_fund_snapshot_version for breakdown."]
per_fund_snapshot_version:
  a1b2c3d4-0001-0010-... (MREF III) → inv5-rebuild-20260411-full-scope
  a1b2c3d4-0002-0020-... (MCOF I)   → inv5-rebuild-20260411-full-scope
  a1b2c3d4-0003-0030-... (IGF VII)  → meridian-20260421T151330Z-325c3fa0
```

Any UI consuming this response sees the `mixed_release_states: True` flag and the per-fund breakdown. No silent blending.

---

## Current authoritative state

| Fund | Released snapshot | Quarter | Status |
|---|---|---|---|
| IGF VII | meridian-20260421T151330Z-325c3fa0 | 2026Q2 | ✅ new release |
| MREF III | inv5-rebuild-20260411-full-scope | 2026Q2 | pending — scope decision required |
| MCOF I | inv5-rebuild-20260411-full-scope | 2026Q2 | pending — attribution report required |

---

## What is NOT changed

- MREF III 2026Q2 — draft `verified` on new snapshot, old release still authoritative
- MCOF I 2026Q2 — draft `verified` on new snapshot, old release still authoritative
- IGF VII 2025Q4 — `verified` on new snapshot, not yet promoted (separate session decision)
- `released_state_lock` trigger — untouched

## What remains (next sessions)

- **Stream 2:** MCOF I IRR attribution report (5-driver decomposition, must reconcile within 1bp, no promotion until report reviewed)
- **MREF III:** User input required on 5 investments in `sourcing` stage before re-promotion
- **IGF VII 2025Q4:** Review and promote separately when ready
