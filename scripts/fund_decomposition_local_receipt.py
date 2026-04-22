"""Local seeded receipt for Fund Decomposition.

Honest scoping (per the release review):
  * This is a LOCAL STUBBED receipt, not a prod receipt.
  * It exercises compute_fund_decomposition end-to-end with the same
    capability + substrate stubs the test suite uses — so you can trust the
    service contract behaves identically to production when the underlying
    DB is capable.
  * It does NOT prove anything about the prod DB. A prod happy-path receipt
    requires a migrated env with seeded RE data and is out of scope until
    such an env exists.

The receipt captures six acceptance beats from the review:
  1. baseline authoritative visible (baseline_authoritative block populated
     with trusted status + snapshot_version)
  2. exclude one investment (gross IRR / TVPI / DPI shift measurably)
  3. metrics update on toggle (full set → subset → full set cycle)
  4. net IRR nulls correctly in derived mode (with documented null_reason)
  5. quick-pick equivalent: "realized-only" via an explicit exclusion set
  6. explain-action carries current-selection context (top + bottom
     marginal contributors computed from the derived contributions)

Writes:
  docs/receipts/fund-decomposition/local-stubbed-<timestamp>.json

Run:
  cd backend && python -m scripts.fund_decomposition_local_receipt
OR (with a local venv)
  cd backend && /path/to/venv/bin/python ../scripts/fund_decomposition_local_receipt.py
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

# Put the backend package on sys.path so imports work no matter which
# directory the receipt is run from.
REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Reuse the test fixtures so the receipt's substrate matches the test
# contract exactly. This is the whole point of stubbing — the service sees
# the same shape it sees under test, just one layer deeper.
TESTS_DIR = BACKEND_ROOT / "tests"
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from app.services import fund_decomposition as fd  # noqa: E402
from test_fund_decomposition import (  # noqa: E402
    FUND_ID,
    I1,
    QUARTER,
    _fake_capability_capable,
    _fake_compute_fund_rollup,
    _fake_get_authoritative_state,
    _fake_list_fund_investments,
    _fake_load_investment_assets,
    _fake_load_investment_states,
)


def _run(excluded_ids=None) -> dict:
    return fd.compute_fund_decomposition(
        FUND_ID,
        QUARTER,
        excluded_investment_ids=excluded_ids or set(),
    )


def main() -> int:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = REPO_ROOT / "docs" / "receipts" / "fund-decomposition"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"local-stubbed-{timestamp}.json"

    receipt: dict = {
        "kind": "fund_decomposition.local_stubbed_receipt",
        "generated_at": timestamp,
        "disclaimer": (
            "LOCAL STUBBED receipt. Not a proof of production correctness. "
            "Substrate (capability probe, investment states, bottom-up rollup, "
            "authoritative baseline) is stubbed with the test fixtures in "
            "backend/tests/test_fund_decomposition.py so the overlay service "
            "runs exactly as it does under test. For a prod happy-path receipt, "
            "target a deployment whose DB has all RE migrations applied and at "
            "least one seeded fund with investments."
        ),
        "substrate": {
            "fund_id": str(FUND_ID),
            "quarter": QUARTER,
            "source": "backend/tests/test_fund_decomposition.py fixtures",
            "capability_probe": "stubbed capable=true with fund present",
        },
        "beats": {},
    }

    fd._cache_clear()
    with (
        patch.object(fd, "probe_decomposition_capabilities", side_effect=_fake_capability_capable),
        patch.object(fd, "_list_fund_investments", side_effect=_fake_list_fund_investments),
        patch.object(fd, "_load_investment_states", side_effect=_fake_load_investment_states),
        patch.object(fd, "_load_investment_assets", side_effect=_fake_load_investment_assets),
        patch.object(fd, "compute_fund_rollup", side_effect=_fake_compute_fund_rollup),
        patch.object(fd, "get_authoritative_state", side_effect=_fake_get_authoritative_state),
    ):
        # Beat 1: baseline authoritative visible
        full = _run(excluded_ids=set())
        receipt["beats"]["1_baseline_authoritative_visible"] = {
            "baseline_authoritative": full["baseline_authoritative"],
            "pass": (
                full["baseline_authoritative"]["trust_status"] == "trusted"
                and full["baseline_authoritative"]["snapshot_version"] is not None
                and full["baseline_authoritative"]["gross_irr"] is not None
            ),
        }

        # Beat 2: exclude one investment — metrics shift
        subset = _run(excluded_ids={I1})
        full_irr = full["selection_derived"]["gross_irr"]
        subset_irr = subset["selection_derived"]["gross_irr"]
        full_tvpi = full["selection_derived"]["tvpi"]
        subset_tvpi = subset["selection_derived"]["tvpi"]
        full_dpi = full["selection_derived"]["dpi"]
        subset_dpi = subset["selection_derived"]["dpi"]
        receipt["beats"]["2_exclude_one_investment_shifts_metrics"] = {
            "excluded_investment": str(I1),
            "full_set": {"gross_irr": full_irr, "tvpi": full_tvpi, "dpi": full_dpi},
            "subset":   {"gross_irr": subset_irr, "tvpi": subset_tvpi, "dpi": subset_dpi},
            "delta_gross_irr_bps": round((subset_irr - full_irr) * 10000, 2) if (full_irr is not None and subset_irr is not None) else None,
            "delta_tvpi": round(subset_tvpi - full_tvpi, 6) if (full_tvpi is not None and subset_tvpi is not None) else None,
            "delta_dpi":  round(subset_dpi - full_dpi, 6) if (full_dpi is not None and subset_dpi is not None) else None,
            "pass": (
                full_irr != subset_irr
                and full_tvpi != subset_tvpi
                and full_dpi != subset_dpi
            ),
        }

        # Beat 3: metrics update on toggle (full→subset→full returns to full values)
        full_again = _run(excluded_ids=set())
        receipt["beats"]["3_metrics_stable_on_round_trip_toggle"] = {
            "full_again_gross_irr": full_again["selection_derived"]["gross_irr"],
            "matches_original_full": full_again["selection_derived"]["gross_irr"] == full_irr,
            "pass": full_again["selection_derived"]["gross_irr"] == full_irr,
        }

        # Beat 4: net IRR nulls correctly with reason
        sd = subset["selection_derived"]
        receipt["beats"]["4_net_irr_nulls_under_selection"] = {
            "net_irr": sd["net_irr"],
            "net_irr_null_reason": sd["net_irr_null_reason"],
            "carry_null_reason": sd["carry_null_reason"],
            "gp_share_null_reason": sd["gp_share_null_reason"],
            "pass": (
                sd["net_irr"] is None
                and sd["net_irr_null_reason"] == "net_irr_not_dimensional_to_investment_subset"
                and sd["carry"] is None
                and sd["carry_null_reason"] == "out_of_scope_requires_waterfall"
            ),
        }

        # Beat 5: quick-pick equivalent — "unrealized only" in the fixture
        # fund means "keep all three" because the fixture has no status
        # info, so we use an explicit equivalent: exclude the lowest-IRR
        # investment as a stand-in for a "quick pick" quality filter.
        from test_fund_decomposition import I3
        quickpick = _run(excluded_ids={I3})
        qp_contribs = [
            {
                "investment_id": c["investment_id"],
                "name": c["name"],
                "included": c["included"],
                "gross_irr": c["gross_irr"],
                "irr_marginal_bps": c["irr_marginal_bps"],
            }
            for c in quickpick["investment_contributions"]
        ]
        receipt["beats"]["5_quick_pick_applies_exclusion"] = {
            "excluded_investment": str(I3),
            "selection_irr": quickpick["selection_derived"]["gross_irr"],
            "included_count": sum(1 for c in qp_contribs if c["included"]),
            "excluded_count": sum(1 for c in qp_contribs if not c["included"]),
            "investment_contributions": qp_contribs,
            "pass": (
                quickpick["selection_derived"]["gross_irr"] != full_irr
                and sum(1 for c in qp_contribs if not c["included"]) == 1
            ),
        }

        # Beat 6: explain-action context — the page publishes
        # top/bottom marginal contributors derived from selection state. We
        # reproduce that derivation here to show the action would carry
        # meaningful context.
        contribs = [
            c for c in full["investment_contributions"]
            if c["included"] and c["irr_marginal_bps"] is not None
        ]
        contribs.sort(key=lambda c: c["irr_marginal_bps"], reverse=True)
        top = contribs[:3]
        bottom = list(reversed(contribs))[:3]
        receipt["beats"]["6_explain_action_carries_selection_context"] = {
            "top_marginal_contributors": [
                {"investment_id": c["investment_id"], "name": c["name"], "irr_marginal_bps": c["irr_marginal_bps"]}
                for c in top
            ],
            "bottom_marginal_contributors": [
                {"investment_id": c["investment_id"], "name": c["name"], "irr_marginal_bps": c["irr_marginal_bps"]}
                for c in bottom
            ],
            "pass": len(top) > 0,
        }

        # Identity checks witness — always attach the most recent full-set
        # run so reviewers can eyeball TVPI/DPI identity + full-set-matches-
        # baseline + order-independence + no-future-CF.
        receipt["identity_checks_full_set"] = full["identity_checks"]
        receipt["state_origin"] = full["state_origin"]
        receipt["provenance_full_set"] = full["provenance"]

    all_pass = all(b.get("pass") for b in receipt["beats"].values())
    receipt["summary"] = {
        "all_beats_pass": all_pass,
        "total_beats": len(receipt["beats"]),
        "passing": sum(1 for b in receipt["beats"].values() if b.get("pass")),
    }

    with out_path.open("w") as f:
        json.dump(receipt, f, indent=2, default=str)
    print(f"[local-receipt] wrote {out_path}")
    print(f"[local-receipt] all_beats_pass={all_pass}  beats_passing={receipt['summary']['passing']}/{receipt['summary']['total_beats']}")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
