"""g03 — PLM engineering changes + specs (convo.md §4 Phase 1 PLM ownership, §17).

Parts / revisions / BOM already exist (g01). This adds the change layer: one engineering
change order (ECO) per revision transition, and one engineering spec per part. SCN-004 hook:
the PART-ENG-VALVE-014 Rev B->C ECO is the tolerance fix that lifts first-pass yield.
"""

from __future__ import annotations

import datetime as _dt
from collections import defaultdict

from .. import ids
from ..context import BuildContext
from ..dataset import Dataset
from ..lineage import SourceSystem as SS

_YEAR = 2026
_ECO_REASONS = ["tolerance update", "material change", "process improvement",
                "supplier change", "drawing correction", "weight reduction"]


def run(ctx: BuildContext, ds: Dataset) -> None:
    _engineering_changes(ctx, ds)
    _specs(ctx, ds)


def _engineering_changes(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("raw_plm_engineering_changes")
    anchor = ids.part(ctx.scenario["anchors"]["valve_part_family"],
                      int(ctx.scenario["anchors"]["valve_part_seq"]))
    # group revisions per part (in rev order A,B,C,...)
    by_part: dict[str, list[dict]] = defaultdict(list)
    for r in ds.get("dim_part_revision").rows:
        by_part[r["part_id"]].append(r)
    rows = []
    eco_seq = 0
    for pid in sorted(by_part):
        revs = sorted(by_part[pid], key=lambda r: r["rev"])
        for i in range(1, len(revs)):
            eco_seq += 1
            from_rev, to_rev = revs[i - 1]["rev"], revs[i]["rev"]
            eff = ctx.start + _dt.timedelta(days=int(rng.integers(0, ctx.days_span())))
            scenario = None
            reason = str(rng.choice(_ECO_REASONS))
            if pid == anchor and from_rev == "B" and to_rev == "C":
                scenario = "SCN-004-REV-C-YIELD-IMPROVEMENT"
                reason = "tolerance fix to raise first-pass yield"
                eff = _dt.date(2026, 4, 15)
            rows.append({
                "eco_id": ids.eco(_YEAR, eco_seq),
                "part_id": pid,
                "from_rev": from_rev,
                "to_rev": to_rev,
                "reason": reason,
                "status": "implemented" if eff < ctx.as_of else "approved",
                "effective_date": eff.isoformat(),
                "scenario_id": scenario,
            })
    ds.add("raw_plm_engineering_changes", rows, key=["eco_id"], source_system=SS.PLM)


def _specs(ctx: BuildContext, ds: Dataset) -> None:
    parts = ds.get("dim_part").rows
    # current (released) revision per part
    released = {}
    for r in ds.get("dim_part_revision").rows:
        if r["status"] == "released":
            released[r["part_id"]] = r["revision_id"]
    rows = []
    for i, p in enumerate(sorted(parts, key=lambda r: r["part_id"])):
        pid = p["part_id"]
        rows.append({
            "spec_id": ids.spec(i + 1),
            "part_id": pid,
            "spec_type": "engineering_spec",
            "title": f"Engineering spec for {pid}",
            "current_revision_id": released.get(pid),
            "scenario_id": None,
        })
    ds.add("raw_plm_specs", rows, key=["spec_id"], source_system=SS.PLM)
