"""data_quality_findings generation (convo.md §9). Governance, not just analytics.

Each finding is DERIVED from real upstream rows produced by g01-g10 — never invented. Findings
are deterministic, explainable (a human-readable detail naming the offending records), and tagged
with the scenario they belong to when they map to a named scenario. dq.py is the only place that
*injects* a small number of governance findings the upstream generators don't already mark; those
counts come from scenario_config (e.g. SCN-001's two missing-signoff serials), never hardcoded.

Rule -> source signal (convo §9 table):
  wo_closed_with_open_ncr   <- raw_qms_ncrs status open on a closed raw_mes_work_order
  missing_inspection_signoff<- SCN-001: first N flight-critical serials on the blocked vehicle (N from config)
  revision_mismatch         <- raw_mes_operation_executions op_revision behind PLM current rev (SCN-004)
  missing_material_cert     <- raw_erp_material_lots cert_present is False
  duplicate_supplier        <- raw_erp_suppliers: one canonical supplier under multiple raw names
  telemetry_dropout         <- raw_test_runs pattern == sensor_dropout
  ai_prediction_no_version  <- fact_ml_prediction with a null model_version_id (audit-trail gap)

Every finding row: finding_id, rule, severity, entity_type, entity_id, detail, scenario_id.
"""

from __future__ import annotations

import json

from . import ids
from .context import BuildContext
from .dataset import Dataset
from .lineage import SourceSystem as SS

_SCN1 = "SCN-001-VEHICLE-TR003-READINESS-BLOCKED"
_SCN4 = "SCN-004-REV-C-YIELD-IMPROVEMENT"


def run(ctx: BuildContext, ds: Dataset) -> None:
    findings: list[dict] = []
    seq = _Seq()

    _tagged_defects(ctx, ds, findings, seq)
    _wo_closed_with_open_ncr(ctx, ds, findings, seq)
    _missing_inspection_signoff(ctx, ds, findings, seq)
    _revision_mismatch(ctx, ds, findings, seq)
    _missing_material_cert(ctx, ds, findings, seq)
    _duplicate_supplier(ctx, ds, findings, seq)
    _telemetry_dropout(ctx, ds, findings, seq)
    _ai_prediction_no_version(ctx, ds, findings, seq)

    ds.add("data_quality_findings", findings, key=["finding_id"], source_system=SS.MASTER)


class _Seq:
    def __init__(self) -> None:
        self.n = 0

    def next(self) -> str:
        self.n += 1
        return ids.dq_finding(self.n)


def _add(findings, seq, rule, severity, entity_type, entity_id, detail, scenario_id=None,
         source_table=None, source_key=None, dq_defect_tag=None):
    findings.append({
        "finding_id": seq.next(),
        "rule": rule,
        "severity": severity,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "detail": detail,
        "scenario_id": scenario_id,
        "source_table": source_table,
        "source_key": source_key,
        "dq_defect_tag": dq_defect_tag,
    })


# --- rules ------------------------------------------------------------------
def _tagged_defects(ctx, ds, findings, seq) -> None:
    """Emit exactly one lineage finding for every intentionally tagged source row."""
    for table in ds.ordered():
        for row in table.sorted_rows():
            tag = row.get("dq_defect_tag")
            if not tag:
                continue
            key = {column: row.get(column) for column in table.key}
            source_key = json.dumps(key, sort_keys=True, separators=(",", ":"))
            entity_id = "|".join(str(key[column]) for column in table.key)
            _add(
                findings,
                seq,
                "injected_defect",
                "known_demo_defect",
                table.name,
                entity_id,
                f"{table.name} {source_key} intentionally carries {tag}.",
                scenario_id=row.get("scenario_id"),
                source_table=table.name,
                source_key=source_key,
                dq_defect_tag=tag,
            )


def _wo_closed_with_open_ncr(ctx, ds, findings, seq) -> None:
    closed = {w["wo_id"] for w in ds.get("raw_mes_work_orders").rows
              if str(w.get("status")) in ("complete", "closed")}
    open_ncrs = [n for n in ds.get("raw_qms_ncrs").sorted_rows()
                 if str(n.get("status")) in ("open", "eng_review_open") and n.get("wo_id") in closed]
    for n in open_ncrs:
        _add(findings, seq, "wo_closed_with_open_ncr", "high", "work_order", n["wo_id"],
             f"{n['wo_id']} closed but {n['ncr_id']} is still {n['status']}.",
             scenario_id=n.get("scenario_id") or "SCN-007-WORKORDER-STATUS-MISMATCH")


def _missing_inspection_signoff(ctx, ds, findings, seq) -> None:
    """SCN-001: exactly N flight-critical serials on the blocked vehicle lack final signoff.
    N comes from config; the serials are the first N flight-critical on that vehicle (deterministic)."""
    vehicle = ctx.scenario["anchors"]["blocked_vehicle"]
    n_missing = int(ctx.scenario["scenarios"][_SCN1]["flight_critical_serials_missing_signoff"])
    parts = {p["part_id"]: p for p in ds.get("dim_part").rows}
    fc_serials = sorted(
        (s for s in ds.get("dim_serialized_item").rows
         if s["vehicle_id"] == vehicle
         and parts.get(s["part_id"], {}).get("criticality") == "flight_critical"),
        key=lambda s: s["serial_id"],
    )
    for s in fc_serials[:n_missing]:
        _add(findings, seq, "missing_inspection_signoff", "critical", "serial", s["serial_id"],
             f"Flight-critical serial {s['serial_id']} ({s['part_id']}) on {vehicle} completed "
             f"without final dimensional inspection signoff.",
             scenario_id=_SCN1)


def _revision_mismatch(ctx, ds, findings, seq) -> None:
    """SCN-004: MES ops built on Rev B while PLM current valve revision is Rev C."""
    fam = ctx.scenario["anchors"]["valve_part_family"]
    seq_n = ctx.scenario["anchors"]["valve_part_seq"]
    valve_part = ids.part(fam, seq_n)
    # PLM current rev = the released revision for the valve part.
    released = [r for r in ds.get("dim_part_revision").rows
                if r["part_id"] == valve_part and str(r.get("status")) == "released"]
    if not released:
        return
    current_rev = sorted(r["rev"] for r in released)[-1]
    behind = [o for o in ds.get("raw_mes_operation_executions").sorted_rows()
              if o.get("scenario_id") == _SCN4 and o.get("op_revision") and o["op_revision"] < current_rev]
    # one representative finding per (revision behind) keeps it explainable, not noisy.
    seen = set()
    for o in behind:
        rev = o["op_revision"]
        if rev in seen:
            continue
        seen.add(rev)
        _add(findings, seq, "revision_mismatch", "medium", "operation", o["op_id"],
             f"MES built {valve_part} Rev {rev} while PLM current is Rev {current_rev}.",
             scenario_id=_SCN4)


def _missing_material_cert(ctx, ds, findings, seq) -> None:
    no_cert = [l for l in ds.get("raw_erp_material_lots").sorted_rows()
               if l.get("cert_present") is False]
    for l in no_cert:
        _add(findings, seq, "missing_material_cert", "high", "material_lot", l["lot_id"],
             f"Material lot {l['lot_id']} has no certificate document.",
             scenario_id=l.get("scenario_id"))


def _duplicate_supplier(ctx, ds, findings, seq) -> None:
    """A canonical supplier appearing under multiple raw names (the AeroMetals dedup case)."""
    if "raw_erp_suppliers" not in ds.tables:
        return
    by_canon: dict[str, list[str]] = {}
    for r in ds.get("raw_erp_suppliers").rows:
        canon = r.get("canonical_supplier_id")
        if canon:
            by_canon.setdefault(canon, []).append(r.get("raw_name"))
    sup_name = {s["supplier_id"]: s.get("canonical_name") for s in ds.get("dim_supplier").rows}
    for canon, names in sorted(by_canon.items()):
        uniq = sorted({n for n in names if n})
        if len(uniq) > 1:
            _add(findings, seq, "duplicate_supplier", "medium", "supplier", canon,
                 f"Supplier {sup_name.get(canon, canon)} appears under {len(uniq)} names: "
                 f"{', '.join(uniq)}.",
                 scenario_id="SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK")


def _telemetry_dropout(ctx, ds, findings, seq) -> None:
    dropouts = [r for r in ds.get("raw_test_runs").sorted_rows()
                if str(r.get("pattern")) == "sensor_dropout"]
    for r in dropouts:
        _add(findings, seq, "telemetry_dropout", "medium", "test_run", r["run_id"],
             f"Sensor flatlined during {r['run_id']} ({r['test_type']}).",
             scenario_id=r.get("scenario_id"))


def _ai_prediction_no_version(ctx, ds, findings, seq) -> None:
    if "fact_ml_prediction" not in ds.tables:
        return
    invalid = [p for p in ds.get("fact_ml_prediction").sorted_rows()
               if not p.get("model_version_id")]
    for p in invalid:
        _add(findings, seq, "ai_prediction_no_version", "high", "ml_prediction", p["prediction_id"],
             f"Prediction {p['prediction_id']} has no model version — invalid ML audit trail.",
             scenario_id=p.get("scenario_id"))


__all__ = ["run"]
