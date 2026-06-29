"""Phase 4 / Spin 5 — Pre-test competence-envelope gate (REAL data, reproducible).

WHAT THIS FILE DOES (plain version): before trusting any model prediction, it checks whether the
new input looks like the data the model was trained on. It measures that with Mahalanobis
distance — a "how far from the training cloud" score that accounts for how the sensors normally
move together. Inputs that sit inside the trained region get scored; ones on the edge get REVIEW;
ones far outside get ABSTAIN (don't issue a confident prediction). Here it trains the envelope on
one operating condition (FD001) and proves most of a different condition (FD004) falls outside it.
WHERE YOU SEE THIS: the frontend CompetenceEnvelopeCard (in / near-boundary / out-of-envelope
rates and the per-sample SCORE/REVIEW/ABSTAIN action).
INPUTS -> OUTPUT: FD001 + FD004 training rows from silver_cmapss -> competence_envelope_evidence.json.
HOW TO READ THE NUMBERS: Mahalanobis distance = distance from the training cloud accounting for
sensor correlations (small = familiar); tau = the boundary line set from FD001's own 99th
percentile; in/near/out rates = share of samples inside / on the edge / outside the trained
envelope (a high FD004 "out" rate is the point — the gate caught a regime it was never trained on).


Flips drift from a post-deployment monitoring idea into an UPSTREAM safety check: before
scoring a unit, ask whether its inputs are inside the operating envelope the model was trained
on. If not, abstain/REVIEW instead of issuing a confident score.

Setup (reuses the Phase 3 FD001->FD004 framing): fit the envelope on C-MAPSS FD001 (a single
operating condition) via Mahalanobis distance to the training distribution, then stress-test on
FD004 (six operating conditions) — a regime-shift the FD001-trained model never saw. Most of
FD004 should land OUT of the FD001 envelope.

Bands: in-envelope (d^2 <= tau) -> score; near-boundary (tau..k_out*tau) -> review;
out-of-envelope (> k_out*tau) -> abstain. tau = 99th percentile of FD001's own training
distances (so FD001 holdout stays ~in-envelope by construction).

Data: silver_cmapss (preserves op-settings + 21 sensors). FD004 is a REGIME-SHIFT STRESS TEST,
not rocket hot-fire data. No fake scores; no "safe"/"certified" language.

Run: python telemetry-platform/compute_competence_envelope.py   (Databricks OAuth profile 'PaulMain')
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import Disposition, Format, StatementState

from envelope_core import ACTION, IN, NEAR, OUT, band, band_rates, fit_envelope, mahalanobis_sq

TEL = "novendor_1.telemetry"
WAREHOUSE_ID = "0e56420fb707d861"
TAU_PCTL = 0.99      # FD001 training percentile that defines the in-envelope boundary
K_OUT = 3.0          # beyond k_out * tau => out-of-envelope (abstain)
SEED = 0
SETTINGS = ["op_setting_1", "op_setting_2", "op_setting_3"]
SENSORS = [f"sensor_{i}" for i in range(1, 22)]
ROOT = Path(__file__).resolve().parents[1]
AS_OF = "2026-06-24"


# Run a SQL query against the Databricks warehouse and return a tidy table. Plumbing only.
def query(w: WorkspaceClient, sql: str) -> pd.DataFrame:
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
    print("[envelope] starting warehouse if stopped...")
    try:
        import datetime
        w.warehouses.start(WAREHOUSE_ID).result(timeout=datetime.timedelta(minutes=5))
    except Exception as exc:
        print(f"[envelope] warehouse note: {str(exc)[:120]}")

    print("[envelope] pulling FD001 + FD004 train rows from silver_cmapss...")
    cols = ", ".join(["subset", "unit", "cycle", "rul_target"] + SETTINGS + SENSORS)
    df = query(w, f"SELECT {cols} FROM {TEL}.silver_cmapss "
                  f"WHERE subset IN ('FD001','FD004') AND split = 'train'")
    for c in ["unit", "cycle", "rul_target"] + SETTINGS + SENSORS:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=SENSORS)
    fd001 = df[df.subset == "FD001"].copy()
    fd004 = df[df.subset == "FD004"].copy()
    print(f"[envelope] FD001 rows={len(fd001)} units={fd001.unit.nunique()} | "
          f"FD004 rows={len(fd004)} units={fd004.unit.nunique()}")

    active = [s for s in SENSORS if fd001[s].std() > 1e-6]

    # FD001 fit/eval split by unit (held-out in-envelope validation).
    rng = np.random.default_rng(SEED)
    units = np.sort(fd001.unit.unique())
    eval_units = set(rng.choice(units, size=max(1, len(units) * 3 // 10), replace=False).tolist())
    fit = fd001[~fd001.unit.isin(eval_units)]
    ev1 = fd001[fd001.unit.isin(eval_units)]

    # Learn the shape of "familiar" from the FD001 fit rows (its center and how the sensors
    # co-vary), then set the boundary line tau at the 99th percentile of those training distances —
    # so 99% of the training data itself counts as in-envelope by construction. Anything farther
    # than tau is treated as unfamiliar.
    scaler = StandardScaler().fit(fit[active].to_numpy())
    mean, cov_inv = fit_envelope(scaler.transform(fit[active].to_numpy()))
    d2_fit = mahalanobis_sq(scaler.transform(fit[active].to_numpy()), mean, cov_inv)
    tau = float(np.quantile(d2_fit, TAU_PCTL))

    # Score two sets against that envelope: held-out FD001 (should look familiar -> mostly
    # in-envelope) and FD004 (a different operating condition the model never saw -> should land
    # mostly out). The in/near/out rates these produce are the two bars on the CompetenceEnvelopeCard
    # and the proof the gate catches a regime shift BEFORE scoring.
    d2_ev1 = mahalanobis_sq(scaler.transform(ev1[active].to_numpy()), mean, cov_inv)
    d2_fd4 = mahalanobis_sq(scaler.transform(fd004[active].to_numpy()), mean, cov_inv)
    rates_fd001 = band_rates(d2_ev1, tau, K_OUT)
    rates_fd004 = band_rates(d2_fd4, tau, K_OUT)

    # Pull one concrete, human-readable sample for each side of the story — a familiar in-envelope
    # case and a far-out one — so the card can show a real example with its distance, band, and
    # action rather than just aggregate rates.
    def example(frame: pd.DataFrame, d2: np.ndarray, pick: str) -> dict:
        # last cycle of a representative unit; pick = 'in' (FD001, low d2) or 'out' (FD004, high d2)
        last = frame.sort_values(["unit", "cycle"]).groupby("unit").tail(1)
        idx_last = last.index.to_numpy()
        d2_last = d2[[list(frame.index).index(i) for i in idx_last]]
        order = np.argsort(d2_last)
        chosen = idx_last[order[len(order) // 4]] if pick == "in" else idx_last[order[-1]]
        row = frame.loc[chosen]
        dist = float(d2[list(frame.index).index(chosen)])
        b = band(dist, tau, K_OUT)
        return {
            "subset": row.subset, "unit": int(row.unit), "cycle": int(row.cycle),
            "op_settings": [round(float(row[s]), 3) for s in SETTINGS],
            "mahalanobis_sq": round(dist, 1), "tau": round(tau, 1),
            "band": b, "action": ACTION[b].upper(),
        }

    ex_in = example(ev1, d2_ev1, "in")
    ex_out = example(fd004, d2_fd4, "out")

    artifact = {
        "as_of": AS_OF,
        "training_reference": "C-MAPSS FD001 (single operating condition)",
        "challenge_set": "C-MAPSS FD004 (six operating conditions) — a regime-shift stress test, NOT rocket hot-fire data",
        "source_table": f"{TEL}.silver_cmapss (split=train)",
        "method": ("Mahalanobis distance to the FD001 training distribution over standardized sensors. "
                   f"in-envelope = d^2 <= tau (tau = {int(TAU_PCTL*100)}th pctl of FD001 training distances); "
                   f"near-boundary = tau..{K_OUT:g}x tau (review); out-of-envelope = > {K_OUT:g}x tau (abstain). "
                   "Held-out FD001 units validate the in-envelope rate."),
        "gate": "out-of-envelope -> ABSTAIN; near-boundary -> REVIEW; in-envelope -> SCORE. Never a confident GO outside the trained envelope.",
        "n_fd001_fit": int(len(fit)), "n_fd001_eval": int(len(ev1)), "n_fd004": int(len(fd004)),
        "n_active_sensors": int(len(active)),
        "metrics": {
            "tau_mahalanobis_sq": round(tau, 1), "k_out": K_OUT,
            "fd001_in_envelope_rate": round(rates_fd001[IN], 4),
            "fd001_near_boundary_rate": round(rates_fd001[NEAR], 4),
            "fd001_out_of_envelope_rate": round(rates_fd001[OUT], 4),
            "fd004_in_envelope_rate": round(rates_fd004[IN], 4),
            "fd004_near_boundary_rate": round(rates_fd004[NEAR], 4),
            "fd004_out_of_envelope_rate": round(rates_fd004[OUT], 4),
        },
        "examples": [ex_in, ex_out],
        "finding": (
            f"An FD001-trained model's competence envelope holds for its own held-out units "
            f"({round(rates_fd001[IN]*100,1)}% in-envelope), but {round(rates_fd004[OUT]*100,1)}% of FD004 "
            f"falls OUT of that envelope (a further {round(rates_fd004[NEAR]*100,1)}% near the boundary). "
            f"The pre-test gate abstains/reviews on those shifted inputs instead of issuing a confident score "
            f"— catching the regime shift before scoring, not after deployment."
        ),
        "limitations": [
            "FD004 is a regime-shift STRESS TEST (different operating conditions), not rocket hot-fire data; it stands in for 'an input outside the model's trained operating envelope'.",
            "Mahalanobis distance assumes an roughly elliptical training distribution; it is a transparent first-line envelope, not a calibrated probability of competence.",
            "The envelope gates on INPUT distribution (operating regime), not on label correctness; in-envelope does not mean the prediction is right, only that it is within trained scope.",
        ],
    }

    # Write the evidence twice: source-of-record copy and the frontend's imported copy. This JSON
    # is exactly what populates the CompetenceEnvelopeCard (baked at compute time, not live).
    out_src = ROOT / "telemetry-platform" / "competence_envelope_evidence.json"
    out_fe = ROOT / "repo-b" / "src" / "lib" / "telemetry" / "competenceEnvelopeEvidence.json"
    out_src.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    out_fe.write_text(json.dumps(artifact, indent=2), encoding="utf-8")

    print("\n=== COMPETENCE ENVELOPE (FD001 trained -> FD004 stress) — measured ===")
    print(f"tau (FD001 {int(TAU_PCTL*100)}th pctl d^2) = {tau:.1f} | k_out = {K_OUT}")
    print(f"FD001 held-out: in {rates_fd001[IN]:.3f} near {rates_fd001[NEAR]:.3f} out {rates_fd001[OUT]:.3f}")
    print(f"FD004 stress  : in {rates_fd004[IN]:.3f} near {rates_fd004[NEAR]:.3f} out {rates_fd004[OUT]:.3f}")
    print(f"example in : {ex_in}")
    print(f"example out: {ex_out}")
    print(f"\nwrote {out_src}\nwrote {out_fe}")


if __name__ == "__main__":
    main()
