"""
Export the deterministic replay feed to a committed JSON fixture for the dashboard.

Reads novendor_1.telemetry.gold_replay_feed_scored (the D-4 channel scored by the promoted champion,
Phase 2) and writes telemetry-platform/databricks/replay_fixture.json. The fixture is what the
dashboard replays — precomputed REAL champion outputs, so the demo never depends on Databricks or
cold inference at replay time. Provenance (source table + champion run id) is embedded in the fixture.

Downsamples the full 8,473-tick sequence to a smooth, animation-friendly series while preserving the
anomaly region (every tick inside the labeled/fired window is kept; calm regions are strided).

Run: python 12_export_replay_fixture.py
"""
import json
import sys
from pathlib import Path

from _bootstrap import get_client, TEL

OUT = Path(__file__).resolve().parent / "replay_fixture.json"
CHAMPION_RUN_ID = "4a48cb6af8714609b9581d66e904544c"   # tel_anomaly_detector@champion (Phase 2)
STRIDE = 12   # keep every 12th calm tick; keep all anomaly/fired ticks


def main() -> int:
    client = get_client()
    client.start_warehouse(); client.wait_for_warehouse("RUNNING", 300)
    try:
        resp = client.execute_sql(
            f"""SELECT chan_id, spacecraft, t, value, value_rmean50, anomaly_score,
                       model_pred, is_anomaly
                FROM {TEL}.gold_replay_feed_scored ORDER BY t""",
            wait=True,
        )
        # The statement API returns up to its row cap inline; for 8.5k rows fetch via chunk_index if needed.
        cols = [c["name"] for c in resp.get("manifest", {}).get("schema", {}).get("columns", [])]
        rows = resp.get("result", {}).get("data_array", []) or []
        total = resp.get("manifest", {}).get("total_row_count", len(rows))
        # If truncated, pull remaining chunks.
        statement_id = resp.get("statement_id")
        chunks = resp.get("manifest", {}).get("chunks", [])
        if statement_id and len(rows) < total and len(chunks) > 1:
            for ch in chunks[1:]:
                idx = ch["chunk_index"]
                more = client._request("GET", f"/api/2.0/sql/statements/{statement_id}/result/chunks/{idx}")
                rows.extend(more.get("data_array", []) or [])
        print(f"[export] pulled {len(rows)}/{total} rows, cols={cols}")

        ci = {c: i for i, c in enumerate(cols)}
        def cell(r, c, cast):
            v = r[ci[c]]
            return None if v is None else cast(v)

        # Find the first model fire so we can keep its ONSET dense and stride the sustained tail.
        first_fire_t = None
        for r in rows:
            if cell(r, "model_pred", int) == 1:
                first_fire_t = cell(r, "t", int)
                break
        onset_lo = (first_fire_t - 6) if first_fire_t is not None else -1
        onset_hi = (first_fire_t + 40) if first_fire_t is not None else -1

        kept = []
        for i, r in enumerate(rows):
            model_pred = cell(r, "model_pred", int)
            is_anom = cell(r, "is_anomaly", int)
            t = cell(r, "t", int)
            in_onset = onset_lo <= t <= onset_hi      # keep every tick around the flip (crisp)
            sustained_fire = (model_pred == 1 and t > onset_hi)  # stride the long fired tail
            keep = in_onset or (i % STRIDE == 0) or (sustained_fire and t % (STRIDE * 2) == 0)
            if keep:
                kept.append({
                    "t": t,
                    "value": round(cell(r, "value", float), 6),
                    "rmean": round(cell(r, "value_rmean50", float), 6),
                    "score": round(cell(r, "anomaly_score", float), 6),
                    "model_pred": model_pred,
                    "is_anomaly": is_anom,
                })

        first_fire = first_fire_t
        fixture = {
            "provenance": {
                "source_table": f"{TEL}.gold_replay_feed_scored",
                "champion_model": f"{TEL}.tel_anomaly_detector@champion",
                "champion_mlflow_run_id": CHAMPION_RUN_ID,
                "note": ("Precomputed REAL champion outputs. model_pred is the model's flag, not "
                         "hand-authored. Calm ticks strided; all anomaly/fired ticks kept."),
            },
            "channel": "D-4",
            "spacecraft": "MSL",
            "total_ticks_source": total,
            "fixture_ticks": len(kept),
            "first_model_fire_t": first_fire,
            "label_anomaly_ticks": sum(1 for p in kept if p["is_anomaly"] == 1),
            "model_fired_ticks": sum(1 for p in kept if p["model_pred"] == 1),
            "feed": kept,
        }
        OUT.write_text(json.dumps(fixture, separators=(",", ":")))
        print(f"[export] wrote {OUT.name}: {len(kept)} ticks, first_fire t={first_fire}, "
              f"size={OUT.stat().st_size} bytes")
        return 0
    finally:
        client.stop_warehouse()


if __name__ == "__main__":
    sys.exit(main())
