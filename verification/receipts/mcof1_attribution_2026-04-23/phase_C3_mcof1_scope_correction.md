# Phase C3 — MCOF I Scope Correction + Scope Enforcement System

**Date:** 2026-04-23  
**Status:** COMPLETE — MCOF I 2026Q2 corrected and released. Scope enforcement system live.

---

## What shipped

| Deliverable | Status |
|---|---|
| Runner scope invariant: COUNT(in_scope) == COUNT(in_db), hard fail | ✅ |
| `scope` metadata in every fund `canonical_metrics` | ✅ |
| `validate_snapshot_for_release` blocks on `scope_completeness='partial'` | ✅ |
| `promote_fund_snapshot` blocks on `scope_completeness='partial'` | ✅ |
| `test_scope_enforcement.py` — 7 tests (two enforcement layers) | ✅ 7/7 green |
| MCOF I `SELECTED_INVESTMENT_IDS` expanded 1 → 8 | ✅ |
| Runner re-run: `meridian-20260423T215941Z-b829d351` | ✅ |
| MCOF I 2026Q2 promoted to released | ✅ |
| Reconciliation: 0 `delta_gt_1usd` flags | ✅ |

---

## Scope enforcement rule (permanent system invariant)

```
For each fund in SELECTED_FUND_IDS:
  in_scope  = COUNT(investments in SELECTED_INVESTMENT_IDS for this fund)
  in_db     = COUNT(re_investment WHERE fund_id = this_fund_id)

  if in_scope < in_db:
    FAIL — append partial_scope exception
    → trust_status = 'untrusted'
    → null_reasons = {"state": "partial_scope"}
    → canonical_metrics.scope.scope_completeness = "partial"
    → promotion BLOCKED (two independent gates)
```

**Belt-and-suspenders promotion blocking:**
1. `null_reasons.state = "partial_scope"` → first gate fires
2. `canonical_metrics.scope.scope_completeness = "partial"` → second gate fires independently

Either alone blocks promotion. Both must pass (or `skip_gate=True`) for release.

---

## MCOF I before/after

| Metric | Old draft (`meridian-20260421T151330Z-325c3fa0`) | Corrected (`meridian-20260423T215941Z-b829d351`) | Old release (`inv5-rebuild-20260411-full-scope`) |
|---|---:|---:|---:|
| gross_irr | **−51.77%** (WRONG — 1/8 scope) | **+2.40%** ✓ | +2.40% |
| net_irr | −56.59% | −1.75% | +2.40% |
| ending_nav | $28,600,000 | **$116,680,385.29** ✓ | $116,680,385.29 |
| scope | 1/8 ⚠ | **8/8 complete** ✓ | n/a |
| trust_status | trusted (incorrectly) | **trusted** | untrusted |
| promotion_state | verified (correctly blocked) | **released** | released |

The old draft's `trust_status=trusted` was a false positive — the IRR gate passed because −51.77% was a valid computed number; the scope gate didn't exist yet. The new system would have caught this before the run completed.

---

## Scope enforcement retrospective

**What the old manifest said:**
> "Meridian Credit Opportunities Fund I / Midtown Towers is the debt and negative-cash-flow sample."

This sampling note described a deliberate design decision — Midtown Towers was chosen as an illustrative debt/cashflow example. The runner correctly built the snapshot for that 1 investment. But the runner had no invariant checking whether that 1 investment was all of them.

**What the new system does:**
- Queries `re_investment` count per fund at runtime
- Compares against manifest count
- Hard-fails with exception if they don't match
- Writes `scope_completeness='partial'` to every downstream row
- Blocks promotion at two independent checkpoints

**When would `partial` legitimately be correct?**  
Never for a fund-level release. Partial scope is only valid for illustrative/sample runs that are explicitly not intended to produce a fund-level IRR. The current runner always produces fund-level metrics — therefore scope must always be complete. If a sampling runner is needed in the future, it must produce rows with a different entity_type or an explicit `trust_status='illustrative'` rather than writing to the authoritative snapshot tables.

---

## Post-promotion state — all three Meridian funds 2026Q2

| Fund | Released snapshot | gross_irr | ending_nav | scope | trust |
|---|---|---:|---:|---|---|
| IGF VII | meridian-20260421T151330Z-325c3fa0 | 53.40% | $1,239,546,917 | n/a (old snap) | trusted |
| MREF III | inv5-rebuild-20260411-full-scope | 5.47% | $42,852,174 | n/a (old snap) | untrusted |
| **MCOF I** | **meridian-20260423T215941Z-b829d351** | **+2.40%** | **$116,680,385** | **8/8 complete** | **trusted** |

Portfolio still in mixed release state (three different snapshot_versions). `mixed_release_states=True` on portfolio KPIs.

---

## Reconciliation

```
Total rows: 39
delta_gt_1usd: 0
```

---

## What is NOT changed

- MREF III 2026Q2 — still on old release; scope question (7 investments in new snap, old snap via waterfall engine) still pending
- IGF VII 2025Q4 — still at `verified` on new snapshot; not yet promoted
- MCOF I 2025Q4 — draft row at `verified` on old snapshots; not promoted
- Scope enforcement only affects the runner + promotion gate — no API or UI changes this session

## What enforced scope prevents permanently

The class of silent partial-scope NAV aggregation is now closed:
- Runner refuses to write without checking scope count
- Snapshot carries scope metadata as machine-readable evidence
- Promotion has two independent scope gates
- Tests pin both enforcement paths

Any future fund addition to `re_investment` that isn't reflected in `SELECTED_INVESTMENT_IDS` will cause the next runner invocation to fail with `partial_scope` — forcing an explicit manifest update before any snapshot can be released.
