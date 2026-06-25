"""Spin 2 (compute) — subsystem/sensor lead-lag attribution on C-MAPSS FD001 (REAL data).

The finding: under physical coupling (the 21 sensors all measure the SAME degrading engine),
channel-level attribution at failure is redundant — many sensors deviate together. Onset timing
and cross-correlation lag separate the sensors that move FIRST (the root signal) from the
downstream responders. This maps onto how a real failure-review board reasons about root cause.

Why C-MAPSS (not SMAP/MSL): C-MAPSS sensors are a coupled physical system over a unit's life, so
lead-lag is meaningful. SMAP/MSL channels are independent anonymized streams where it is not.

Method (per unit, sorted by cycle):
  - onset cycle per sensor = first cycle the (smoothed) sensor stays > k-sigma from its early-life
    baseline; lead-time = failure_cycle - onset_cycle.
  - count_deviating at the last cycle = the channel-level redundancy at failure.
Aggregate: per-sensor median lead-time + onset frequency -> the consistent LEAD sensors; cross-
correlation lag between the lead sensor and the others -> how far downstream sensors lag.

ML-only: writes a telemetry-platform artifact; UI card deferred (parallel agent owns the frontend).

Run: python telemetry-platform/compute_lead_lag_attribution.py   (Databricks OAuth profile 'PaulMain')
"""

import json
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import Disposition, Format, StatementState

from lead_lag_core import count_deviating, cross_correlation_lag, onset_index

TEL = "novendor_1.telemetry"
WAREHOUSE_ID = "0e56420fb707d861"
SENSORS = [f"sensor_{i}" for i in range(1, 22)]
BASELINE_N = 25       # early-life cycles defining each sensor's nominal baseline
K_SIGMA = 4.0         # deviation threshold (matches the anomaly detector's K)
MAX_LAG = 30          # cross-correlation search (cycles)
SEED = 0
ROOT = Path(__file__).resolve().parents[1]
AS_OF = "2026-06-24"


def query_sql(w: WorkspaceClient, sql: str) -> pd.DataFrame:
    resp = w.statement_execution.execute_statement(
        statement=sql, warehouse_id=WAREHOUSE_ID, wait_timeout="50s",
        disposition=Disposition.INLINE, format=Format.JSON_ARRAY,
    )
    sid = resp.statement_id
    while resp.status.state in (StatementState.PENDING, StatementState.RUNNING):
        time.sleep(2)
        resp = w.statement_execution.get_statement(sid)
    if resp.status.state != StatementState.SUCCEEDED:
        raise RuntimeError(f"SQL {resp.status.state}: {resp.status.error}")
    cols = [c.name for c in resp.manifest.schema.columns]
    rows = list(resp.result.data_array or [])
    for n in range(1, resp.manifest.total_chunk_count or 1):
        rows.extend(w.statement_execution.get_statement_result_chunk_n(sid, n).data_array or [])
    return pd.DataFrame(rows, columns=cols)


def main() -> None:
    w = WorkspaceClient(profile="PaulMain")
    print("[lead-lag] starting warehouse if stopped...")
    try:
        import datetime
        w.warehouses.start(WAREHOUSE_ID).result(timeout=datetime.timedelta(minutes=5))
    except Exception as exc:
        print(f"[lead-lag] warehouse note: {str(exc)[:120]}")

    print("[lead-lag] pulling FD001 train sensor trajectories from silver_cmapss...")
    cols = ", ".join(["unit", "cycle"] + SENSORS)
    df = query_sql(w, f"SELECT {cols} FROM {TEL}.silver_cmapss "
                      f"WHERE subset = 'FD001' AND split = 'train'")
    for c in ["unit", "cycle"] + SENSORS:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=SENSORS).sort_values(["unit", "cycle"])

    active = [s for s in SENSORS if df[s].std() > 1e-6]
    print(f"[lead-lag] units={df.unit.nunique()} active_sensors={len(active)} "
          f"(dropped {len(SENSORS)-len(active)} constant)")

    lead_times = defaultdict(list)     # sensor -> list of (failure_cycle - onset_cycle) over units
    onset_count = defaultdict(int)     # sensor -> # units where it had an onset
    deviating_at_failure = []          # per unit: how many active sensors deviated by the last cycle
    n_units = 0
    per_unit_traj: dict[int, dict[str, np.ndarray]] = {}

    for unit, g in df.groupby("unit"):
        g = g.sort_values("cycle")
        if len(g) < BASELINE_N + 10:
            continue
        n_units += 1
        failure_cycle = len(g) - 1
        vals = g[active].to_numpy()
        deviating_at_failure.append(count_deviating(vals, BASELINE_N, K_SIGMA))
        traj = {}
        for j, s in enumerate(active):
            series = vals[:, j]
            traj[s] = series
            oi = onset_index(series, BASELINE_N, K_SIGMA)
            if oi is not None:
                lead_times[s].append(failure_cycle - oi)
                onset_count[s] += 1
        per_unit_traj[int(unit)] = traj

    # Rank sensors by consistency (onset frequency) then median lead-time.
    ranked = []
    for s in active:
        freq = onset_count[s] / n_units
        med_lead = float(np.median(lead_times[s])) if lead_times[s] else 0.0
        ranked.append({"sensor": s, "onset_frequency": round(freq, 3),
                       "median_lead_cycles": round(med_lead, 1)})
    # Lead = high frequency AND high lead-time.
    ranked.sort(key=lambda r: (r["onset_frequency"] >= 0.6, r["median_lead_cycles"]), reverse=True)
    lead_sensors = [r["sensor"] for r in ranked if r["onset_frequency"] >= 0.6][:3]

    median_redundant = float(np.median(deviating_at_failure))

    # Cross-correlation lag: the top lead sensor vs every other active sensor, median over units.
    lag_to_downstream = {}
    if lead_sensors:
        lead = lead_sensors[0]
        for s in active:
            if s == lead:
                continue
            lags = [cross_correlation_lag(t[lead], t[s], MAX_LAG)
                    for t in per_unit_traj.values() if lead in t and s in t]
            if lags:
                lag_to_downstream[s] = float(np.median(lags))
    downstream_lags = [v for v in lag_to_downstream.values() if v > 0]
    median_downstream_lag = float(np.median(downstream_lags)) if downstream_lags else None

    # Example unit: show the redundant count + the lead sensor's lead-time.
    ex_unit = next(iter(per_unit_traj))
    ex_vals = df[df.unit == ex_unit].sort_values("cycle")[active].to_numpy()
    ex = {
        "unit": ex_unit,
        "sensors_deviating_at_failure": int(count_deviating(ex_vals, BASELINE_N, K_SIGMA)),
        "active_sensors": len(active),
        "lead_sensor": lead_sensors[0] if lead_sensors else None,
        "lead_sensor_lead_cycles": (
            int(np.median(lead_times[lead_sensors[0]])) if lead_sensors and lead_times[lead_sensors[0]] else None),
    }

    artifact = {
        "as_of": AS_OF,
        "dataset": "C-MAPSS FD001 (single condition; 21 sensors on one coupled engine over its life)",
        "source_table": f"{TEL}.silver_cmapss (subset=FD001, split=train)",
        "method": (f"Per unit: per-sensor onset = first cycle the smoothed sensor stays > {K_SIGMA}-sigma "
                   f"from its first-{BASELINE_N}-cycle baseline; lead-time = failure_cycle - onset. "
                   "count_deviating at the last cycle = channel-level redundancy. Lead sensors = onset "
                   "frequency >= 0.6 ranked by median lead-time; cross-correlation lag of downstream "
                   "sensors vs the top lead sensor (positive = downstream follows the lead)."),
        "n_units": n_units, "n_active_sensors": len(active),
        "metrics": {
            "median_sensors_deviating_at_failure": median_redundant,
            "channel_attribution_redundancy_pct": round(median_redundant / len(active) * 100, 1),
            "lead_sensors": lead_sensors,
            "median_downstream_lag_cycles": median_downstream_lag,
        },
        "sensor_ranking": ranked,
        "example": ex,
        "finding": (
            f"On the coupled FD001 engine, channel-level attribution is redundant: at failure a median "
            f"of {median_redundant:.0f} of {len(active)} sensors are deviating "
            f"({round(median_redundant/len(active)*100)}% co-move). Onset timing identifies the "
            f"sensors that move FIRST — {', '.join(lead_sensors) if lead_sensors else 'none'} consistently "
            f"lead (onset in >=60% of units"
            + (f", median {int(np.median(lead_times[lead_sensors[0]]))} cycles of lead time" if lead_sensors and lead_times[lead_sensors[0]] else "")
            + ")"
            + (f"; downstream sensors lag the lead by a median of {median_downstream_lag:.0f} cycles" if median_downstream_lag else "")
            + ". The lead sensors are the root signal; the rest are downstream responders."
        ),
        "limitations": [
            "C-MAPSS is simulated turbofan degradation; the lead-lag structure is a pattern, not ground-truth subsystem wiring.",
            "Onset is a threshold-crossing on the raw sensor, not a calibrated change-point test; it is a transparent first-line attribution.",
            "Lead-lag identifies which sensors move first, not the physical cause; it narrows root-cause search, it does not assign blame.",
        ],
    }

    out_src = ROOT / "telemetry-platform" / "lead_lag_attribution_evidence.json"
    out_src.write_text(json.dumps(artifact, indent=2), encoding="utf-8")

    print("\n=== SENSOR LEAD-LAG ATTRIBUTION (FD001) — measured ===")
    print(f"units {n_units} | active sensors {len(active)}")
    print(f"median sensors deviating at failure: {median_redundant:.0f} of {len(active)} "
          f"({median_redundant/len(active)*100:.0f}% redundant)")
    print(f"lead sensors (onset-freq>=0.6, by lead-time): {lead_sensors}")
    print(f"median downstream lag vs lead: {median_downstream_lag} cycles")
    print(f"top-5 ranking: {ranked[:5]}")
    print(f"\nwrote {out_src}")
    print("[lead-lag] UI card deferred — parallel agent owns the telemetry frontend refactor.")


if __name__ == "__main__":
    main()
