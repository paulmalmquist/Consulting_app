# Phase B1 — Meridian Reconciliation Baseline (2026Q2)

**Date:** 2026-04-20
**Env:** `a1b2c3d4-0001-0001-0003-000000000001` (Meridian)
**Business:** `a1b2c3d4-0001-0001-0001-000000000001`
**Quarter:** 2026Q2
**Supabase project:** `ozboonlsplroialdwuxj`

---

## Result — CLEAN

All three Meridian fund rollups reconcile exactly (to the penny) against their released authoritative snapshot claims.

| Fund | Inv Count | Inv QS Count | Rollup NAV | Snapshot NAV | Delta | Flag |
|---|---:|---:|---:|---:|---:|---|
| Institutional Growth Fund VII | 20 | 20 | $1,446,373,530.90 | $1,446,373,530.90 | $0.00 | `within_tolerance` |
| Meridian Credit Opportunities Fund I | 8 | 8 | $116,680,385.29 | $116,680,385.29 | $0.00 | `within_tolerance` |
| Meridian Real Estate Fund III | 7 | 2 | $42,852,173.50 | $42,852,173.50 | $0.00 | `within_tolerance` |

**Snapshot version (all three):** `inv5-rebuild-20260411-full-scope`
**promotion_state (all three):** `released`
**trust_status (fund-level):** `untrusted`
**irr_trust_state (metric-level):** `trusted`
**gross_irr:** IGF VII 66.42%, MCOF I 2.40%, MREF III 5.47%

---

## Observations

1. **IGF VII scope expansion IS live** — 20/20 investments are seeded, quarter state populated for all 20, snapshot NAV exactly matches the sum ($1,446M). This is the post-session-2 rebuild.

2. **MREF III has a scope gap internally** — only 2 of 7 investments (`inv_qs_count = 2`) have `re_investment_quarter_state` rows. The released snapshot at $42.85M equals the sum of those 2 investments. The snapshot is self-consistent with the scoped input, but the scope is incomplete. **This is an upstream seeding issue, not a reconciliation mismatch.**

3. **MCOF I has 8/8 investment quarter state coverage** — the prior final_report.md mentioned 1/8, which reflected the state at 2026-04-11 before session 2 expanded scope. As of now, MCOF I is also fully scoped and reconciles cleanly.

4. **trust_status = untrusted at the fund level is intentional** — the fund-level carries `untrusted` because waterfall-dependent metrics (net_irr, net_tvpi, carry) are null-by-design. The gross metrics (ending_nav, gross_irr, dpi, tvpi) carry `irr_trust_state = trusted` via the Phase 3e per-metric gate.

---

## Gate implication

Since the baseline is already clean and all three funds post-session-2 snapshots reconcile to zero delta, **there is no pending re-promotion needed for NAV/IRR correctness on IGF VII**. The `inv5-rebuild-20260411-full-scope` snapshot is already correct by construction.

**The remaining work for B3 is the IGF VII waterfall run**, not the NAV rebuild:
- Phase B2 (migration 468) populates the NULL tier 1–3 splits in the IGF VII waterfall definition
- After B2, run `run_waterfall` for IGF VII 2026Q2 → produces valid carry
- With a valid carry, the fund's net_irr / net_tvpi / gross_net_spread stop being null-by-design
- Re-promote with the new net metrics populated; snapshot_version changes from `inv5-rebuild-20260411-full-scope` to something reflecting the waterfall run

MREF III remains NOT SAFE until its scope gap is filled (5 of 7 investments missing quarter state — user-input decision required).
MCOF I is scoped and reconciles; the `total_called vs total_committed` relationship on that fund is within bounds ($120M called vs $600M committed) — no seeding error detected at the fund level.

---

## Raw baseline receipt (JSON)

```json
{
  "env_id": "a1b2c3d4-0001-0001-0003-000000000001",
  "business_id": "a1b2c3d4-0001-0001-0001-000000000001",
  "quarter": "2026Q2",
  "generated_at": "2026-04-20T00:00:00Z",
  "funds": [
    {
      "fund_id": "a1b2c3d4-0003-0030-0001-000000000001",
      "name": "Institutional Growth Fund VII",
      "inv_count": 20,
      "inv_qs_count": 20,
      "rollup_nav": "1446373530.90",
      "snap_ending_nav": "1446373530.90",
      "delta": "0.00",
      "flag": "within_tolerance",
      "snapshot_version": "inv5-rebuild-20260411-full-scope",
      "promotion_state": "released",
      "trust_status": "untrusted",
      "irr_trust_state": "trusted",
      "snap_irr": "0.6642"
    },
    {
      "fund_id": "a1b2c3d4-0002-0020-0001-000000000001",
      "name": "Meridian Credit Opportunities Fund I",
      "inv_count": 8,
      "inv_qs_count": 8,
      "rollup_nav": "116680385.29",
      "snap_ending_nav": "116680385.29",
      "delta": "0.00",
      "flag": "within_tolerance",
      "snapshot_version": "inv5-rebuild-20260411-full-scope",
      "promotion_state": "released",
      "trust_status": "untrusted",
      "irr_trust_state": "trusted",
      "snap_irr": "0.0240"
    },
    {
      "fund_id": "a1b2c3d4-0001-0010-0001-000000000001",
      "name": "Meridian Real Estate Fund III",
      "inv_count": 7,
      "inv_qs_count": 2,
      "rollup_nav": "42852173.50",
      "snap_ending_nav": "42852173.50",
      "delta": "0.00",
      "flag": "within_tolerance",
      "snapshot_version": "inv5-rebuild-20260411-full-scope",
      "promotion_state": "released",
      "trust_status": "untrusted",
      "irr_trust_state": "trusted",
      "snap_irr": "0.0547"
    }
  ]
}
```
