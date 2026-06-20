"""
Phase 6 — authentic operated-history backfill for the telemetry-demo tenant.

Turns the thin demo (1 run, 3 predictions, empty events/drift) into a credible operated history using
ONLY real pipeline outputs over the real NASA Gold data in novendor_1.telemetry:

  - test runs   : real SMAP/MSL channels + a sample of real C-MAPSS units (real row counts)
  - predictions : the frozen champion MAD rule scored over real per-channel windows
                  (GO / REVIEW / NO_GO from the real anomaly_score), one row per channel-window
  - events      : the real NASA labeled anomaly windows (point/contextual), source='label';
                  plus source='model' where a scored window fired NO_GO
  - drift       : real PSI of sequential test windows vs the train-split baseline distribution
                  (10-bin histograms pulled from Gold; PSI computed here)

No fabricated measurements/labels/scores/PSI. Only the operational timestamps are synthetic, spread
across a recent window and flagged is_backfilled=true + a fixed backfill_batch_id so the backfill is
idempotent and live /score receipts (is_backfilled=false) are preserved.

Heavy aggregation runs in Databricks SQL; only compact results are pulled. The script EMITS a
committed, idempotent seed_serving_backfill.sql; apply it with:
    cat telemetry-platform/databricks/seed_serving_backfill.sql | supabase db query --linked

Run: python 13_backfill_serving.py
"""
from __future__ import annotations

import json
import math
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from _bootstrap import get_client, TEL

# ---- config ----------------------------------------------------------------
ENV_ID = "telemetry-demo"
BUSINESS_ID = "7e1eb000-0000-4000-a000-000000000001"
BATCH_ID = "phase6-backfill-v1"
D4_RUN_ID = "7e1e7a00-0000-4000-a000-000000000001"  # existing (is_backfilled=false) D-4 run
_NS = uuid.UUID("7e1e0000-0000-4000-a000-0000000000ff")  # deterministic uuid5 namespace

# Frozen champion params (must match backend/app/services/telemetry_serving.py).
MAD_K = 4.0
GLOBAL_TRAIN_SCALE = 0.033866801182436346
THRESHOLD = MAD_K * GLOBAL_TRAIN_SCALE  # 0.135467...

NW = 12          # windows per SMAP/MSL channel
N_CHANNELS = 30  # SMAP/MSL channels to score (the anomaly fleet)
N_DRIFT_CH = 8   # channels monitored for PSI drift
N_CMAPSS = 12    # C-MAPSS units to list as ingested RUL runs
PSI_BINS = 10
OUT = Path(__file__).resolve().parent / "seed_serving_backfill.sql"

# REVIEW band on the real anomaly_score (score = peak_resid / threshold).
def verdict_for(score: float) -> str:
    if score < 1.0:
        return "GO"
    if score <= 2.0:
        return "REVIEW"
    return "NO_GO"


def run_id_for(run_key: str) -> str:
    return str(uuid.uuid5(_NS, run_key))


def row_id_for(*parts) -> str:
    return str(uuid.uuid5(_NS, "|".join(str(p) for p in parts)))


def sql_str(s) -> str:
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def main() -> int:
    client = get_client()
    client.start_warehouse(); client.wait_for_warehouse("RUNNING", 300)
    try:
        def q(sql: str):
            return _fetch_all(client, sql)

        # ---- pick a REPRESENTATIVE fleet (mostly-nominal + a degraded minority) ----
        # Real selection, not fabrication: an operated test stand is mostly healthy with a few
        # degraded assets. SMAP/MSL channels span a wide anomaly fraction; rank by it and take a
        # mostly-low-anomaly fleet plus a high-anomaly tail so the history reads operated, not broken.
        chans = q(f"""
            SELECT chan_id, max(spacecraft) AS spacecraft, count(*) AS n, sum(is_anomaly) AS anom
            FROM {TEL}.gold_smap_msl_windows WHERE split='test'
            GROUP BY chan_id
        """)
        chan_meta = {r[0]: {"spacecraft": r[1], "rows": int(r[2]),
                            "frac": int(r[3]) / max(int(r[2]), 1)} for r in chans}
        ranked = sorted(chan_meta, key=lambda c: chan_meta[c]["frac"])  # ascending anomaly fraction
        n_low = N_CHANNELS * 2 // 3            # ~20 mostly-nominal channels
        n_high = N_CHANNELS - n_low            # ~10 degraded channels
        fleet = list(dict.fromkeys(ranked[:n_low] + ranked[-n_high:]))
        if "D-4" in chan_meta and "D-4" not in fleet:
            fleet.append("D-4")                # keep the replay channel represented
        drift_ch = ranked[:N_DRIFT_CH - 3] + ranked[-3:]  # mostly-stable monitors + a few drifting
        in_fleet = ",".join(sql_str(c) for c in fleet)
        print(f"[backfill] fleet = {len(fleet)} channels "
              f"({n_low} mostly-nominal + {n_high} degraded); drift monitors = {len(drift_ch)}")

        # ---- per-(channel,window) champion aggregates (real peak residual) ----
        win_rows = q(f"""
            WITH b AS (
              SELECT chan_id, max(t) AS max_t FROM {TEL}.gold_smap_msl_windows
              WHERE split='test' AND chan_id IN ({in_fleet}) GROUP BY chan_id
            ),
            w AS (
              SELECT g.chan_id, g.spacecraft,
                least(CAST(floor(g.t * {NW} / (b.max_t + 1)) AS INT), {NW-1}) AS widx,
                g.t, abs(g.value - g.value_rmean50) AS resid, g.is_anomaly
              FROM {TEL}.gold_smap_msl_windows g JOIN b USING (chan_id) WHERE g.split='test'
            )
            SELECT chan_id, max(spacecraft) AS spacecraft, widx,
                   min(t) AS wstart, max(t) AS wend,
                   max(resid) AS peak_resid, max(is_anomaly) AS anom_any, count(*) AS n
            FROM w GROUP BY chan_id, widx ORDER BY chan_id, widx
        """)
        print(f"[backfill] pulled {len(win_rows)} channel-window aggregates")

        # ---- labels (real anomaly windows) ----
        labels = q(f"""
            SELECT chan_id, max(spacecraft) AS spacecraft, max(anomaly_sequences) AS seqs,
                   max(anomaly_class) AS classes
            FROM {TEL}.silver_smap_msl_labels WHERE chan_id IN ({in_fleet}) GROUP BY chan_id
        """)
        label_map = {r[0]: (r[2], r[3]) for r in labels}

        # ---- C-MAPSS units sample (real row counts) -> ingested RUL runs ----
        cmapss = q(f"""
            SELECT subset, unit, count(*) AS n FROM {TEL}.gold_cmapss_features
            WHERE split='test' GROUP BY subset, unit ORDER BY subset, unit
        """)
        # deterministic spread across subsets
        cmapss_sample = cmapss[:: max(1, len(cmapss) // N_CMAPSS)][:N_CMAPSS]

        # ---- PSI histograms: train baseline + per-window, for drift monitors ----
        in_drift = ",".join(sql_str(c) for c in drift_ch)
        base_hist = q(f"""
            WITH r AS (SELECT chan_id, min(value) lo, max(value) hi FROM {TEL}.gold_smap_msl_windows
                       WHERE split='train' AND chan_id IN ({in_drift}) GROUP BY chan_id)
            SELECT g.chan_id,
                   least(greatest(width_bucket(g.value, r.lo, r.hi, {PSI_BINS}), 1), {PSI_BINS}) AS bin,
                   count(*) AS n
            FROM {TEL}.gold_smap_msl_windows g JOIN r USING (chan_id)
            WHERE g.split='train' GROUP BY g.chan_id, bin
        """)
        win_hist = q(f"""
            WITH r AS (SELECT chan_id, min(value) lo, max(value) hi FROM {TEL}.gold_smap_msl_windows
                       WHERE split='train' AND chan_id IN ({in_drift}) GROUP BY chan_id),
                 b AS (SELECT chan_id, max(t) AS max_t FROM {TEL}.gold_smap_msl_windows
                       WHERE split='test' AND chan_id IN ({in_drift}) GROUP BY chan_id)
            SELECT g.chan_id,
                   least(CAST(floor(g.t * {NW} / (b.max_t + 1)) AS INT), {NW-1}) AS widx,
                   least(greatest(width_bucket(g.value, r.lo, r.hi, {PSI_BINS}), 1), {PSI_BINS}) AS bin,
                   count(*) AS n
            FROM {TEL}.gold_smap_msl_windows g JOIN r USING (chan_id) JOIN b USING (chan_id)
            WHERE g.split='test' GROUP BY g.chan_id, widx, bin
        """)
        print(f"[backfill] PSI histograms: {len(base_hist)} baseline bins, {len(win_hist)} window bins")

    finally:
        client.stop_warehouse()

    # ---- compute everything locally (real values; no fabrication) ----
    now = datetime.now(timezone.utc)
    span_days = 45

    test_runs, channels, predictions, events, drift = [], [], [], [], []

    # SMAP/MSL runs + channels
    used_runs = {}
    for i, c in enumerate(fleet):
        rk = f"smap_msl:{c}:test"
        rid = D4_RUN_ID if c == "D-4" else run_id_for(rk)
        used_runs[c] = rid
        ts = now - timedelta(days=span_days * (1 - i / max(len(fleet), 1)))
        if c != "D-4":  # D-4 run already exists (is_backfilled=false); do not duplicate
            test_runs.append(dict(id=rid, run_key=rk, dataset="smap_msl", unit=c,
                                  spacecraft=chan_meta[c]["spacecraft"], rows=chan_meta[c]["rows"],
                                  ingest_at=ts, status="ingested"))
            channels.append(dict(id=row_id_for("ch", rid, "value"), run_id=rid, name="value",
                                 unit="normalized"))

    # predictions from real per-window peaks
    win_by_chan: dict[str, list] = {}
    for r in win_rows:
        win_by_chan.setdefault(r[0], []).append(r)
    pred_idx = 0
    total_windows = sum(len(v) for v in win_by_chan.values()) or 1
    for c, rows in win_by_chan.items():
        rid = used_runs.get(c)
        if rid is None:
            continue
        for r in rows:
            _, spacecraft, widx, wstart, wend, peak, anom_any, n = r
            peak = float(peak); wstart = int(wstart); wend = int(wend)
            score = round(peak / THRESHOLD, 6)
            v = verdict_for(score)
            ts = now - timedelta(days=span_days * (1 - pred_idx / total_windows))
            predictions.append(dict(
                id=row_id_for("pred", rid, widx), run_id=rid, channel="value",
                wstart=wstart, wend=wend, score=score, threshold=round(THRESHOLD, 6),
                verdict=v, model="tel_anomaly_detector", version="1",
                mlflow="4a48cb6af8714609b9581d66e904544c",
                attribution=json.dumps([{"channel_name": "value", "contribution": round(peak, 6)}]),
                created_at=ts))
            # model-detected event where a window fired NO_GO
            if v == "NO_GO":
                events.append(dict(id=row_id_for("evt-model", rid, widx), run_id=rid, channel="value",
                                   start_t=wstart, end_t=wend, klass="point", conf=round(min(score/3, 1), 4),
                                   source="model", created_at=ts))
            pred_idx += 1

    # anomaly events from REAL labels (source='label')
    for c in fleet:
        rid = used_runs.get(c)
        if rid is None or c not in label_map:
            continue
        seqs_raw, classes_raw = label_map[c]
        try:
            seqs = json.loads(seqs_raw)
            classes = [s.strip() for s in str(classes_raw).strip("[]").split(",")]
        except Exception:
            continue
        for j, win in enumerate(seqs):
            klass = classes[j] if j < len(classes) else "point"
            events.append(dict(id=row_id_for("evt-label", rid, j), run_id=rid, channel="value",
                               start_t=int(win[0]), end_t=int(win[1]), klass=klass, conf=1.0,
                               source="label", created_at=now - timedelta(days=span_days // 2)))

    # C-MAPSS ingested runs (RUL fleet; no anomaly predictions)
    for i, r in enumerate(cmapss_sample):
        subset, unit, n = r[0], int(r[1]), int(r[2])
        rk = f"cmapss:{subset}:unit{unit}:test"
        rid = run_id_for(rk)
        ts = now - timedelta(days=span_days * (1 - i / max(len(cmapss_sample), 1)))
        test_runs.append(dict(id=rid, run_key=rk, dataset="cmapss", unit=f"{subset}/unit{unit}",
                              spacecraft=None, rows=n, ingest_at=ts, status="ingested"))

    # ---- PSI drift from real histograms ----
    drift = compute_psi(base_hist, win_hist, drift_ch, now, span_days)
    if not drift:
        print("[backfill] BLOCKER: PSI could not be computed from Gold histograms — leaving drift empty.")

    # rolling anomaly rate snapshots (real: NO_GO+REVIEW share per window index across the fleet)
    drift += rolling_rate(predictions, now, span_days)

    # ---- emit idempotent seed SQL ----
    emit_sql(test_runs, channels, predictions, events, drift)
    print(f"[backfill] wrote {OUT.name}: runs={len(test_runs)} channels={len(channels)} "
          f"predictions={len(predictions)} events={len(events)} drift={len(drift)}")

    print_samples(test_runs, channels, predictions, events, drift)
    return 0


def compute_psi(base_hist, win_hist, drift_ch, now, span_days):
    """Real PSI per (channel, window) vs the train baseline. PSI = sum((c-b)*ln(c/b))."""
    base = {}
    for r in base_hist:
        base.setdefault(r[0], {})[int(r[1])] = int(r[2])
    wins = {}
    for r in win_hist:
        wins.setdefault((r[0], int(r[1])), {})[int(r[2])] = int(r[3])

    out = []
    for c in drift_ch:
        b = base.get(c)
        if not b:
            continue
        btot = sum(b.values()) or 1
        bpct = {k: max(b.get(k, 0) / btot, 1e-6) for k in range(1, PSI_BINS + 1)}
        widxs = sorted({w for (cc, w) in wins if cc == c})
        for w in widxs:
            cur = wins.get((c, w), {})
            ctot = sum(cur.values()) or 1
            psi = 0.0
            for k in range(1, PSI_BINS + 1):
                cp = max(cur.get(k, 0) / ctot, 1e-6)
                psi += (cp - bpct[k]) * math.log(cp / bpct[k])
            psi = round(psi, 6)
            status = "stable" if psi < 0.1 else ("watch" if psi <= 0.25 else "drift")
            ts = now - timedelta(days=span_days * (1 - w / PSI_BINS))
            out.append(dict(id=_row("psi", c, w), model="tel_anomaly_detector",
                            metric="psi", value=psi, window=f"{c}:w{w} ({status})", ts=ts))
    return out


def rolling_rate(predictions, now, span_days):
    """Real rolling NO_GO+REVIEW share per window bucket across the scored fleet."""
    from collections import defaultdict
    buckets = defaultdict(lambda: [0, 0])
    for p in predictions:
        b = buckets[p["wstart"] // 1000]
        b[1] += 1
        if p["verdict"] in ("NO_GO", "REVIEW"):
            b[0] += 1
    out = []
    for i, (k, (hit, tot)) in enumerate(sorted(buckets.items())):
        rate = round(hit / tot, 6) if tot else 0.0
        out.append(dict(id=_row("rate", k), model="tel_anomaly_detector",
                        metric="rolling_anomaly_rate", value=rate, window=f"t{k*1000}-{(k+1)*1000}",
                        ts=now - timedelta(days=span_days * (1 - i / max(len(buckets), 1)))))
    return out


def _row(*parts):
    return str(uuid.uuid5(_NS, "|".join(str(p) for p in parts)))


def _ts(dt: datetime) -> str:
    return "'" + dt.strftime("%Y-%m-%d %H:%M:%S+00") + "'"


def emit_sql(test_runs, channels, predictions, events, drift):
    L = []
    L.append("-- seed_serving_backfill.sql  (GENERATED by 13_backfill_serving.py — do not hand-edit)")
    L.append("-- Phase 6 operated-history backfill for the telemetry-demo tenant.")
    L.append("-- Every row is derived from REAL public NASA analog data + the REAL frozen champion rule")
    L.append("-- (MAD_K=4.0, threshold=0.135467) and REAL labeled anomaly windows / REAL PSI histograms.")
    L.append("-- Only operational timestamps are synthetic (spread over ~45d); rows are flagged")
    L.append(f"-- is_backfilled=true, backfill_batch_id='{BATCH_ID}'. Live /score receipts (is_backfilled=false)")
    L.append("-- are NOT touched. Idempotent: deletes only this batch's prior rows, then re-inserts.")
    L.append("BEGIN;")
    # delete prior backfilled rows (FK-safe order), demo-tenant + backfill-scoped
    for t in ("tel_predictions", "tel_anomaly_events", "tel_drift_metrics",
              "tel_telemetry_channels", "tel_test_runs"):
        L.append(f"DELETE FROM {t} WHERE env_id='{ENV_ID}' AND is_backfilled=true "
                 f"AND backfill_batch_id='{BATCH_ID}';")
    e, b, bf = sql_str(ENV_ID), sql_str(BUSINESS_ID), sql_str(BATCH_ID)

    for r in test_runs:
        L.append(
            "INSERT INTO tel_test_runs (id,env_id,business_id,run_key,dataset,unit_or_channel,"
            "spacecraft,row_count,ingest_at,status,is_backfilled,backfill_batch_id) VALUES ("
            f"{sql_str(r['id'])},{e},{b},{sql_str(r['run_key'])},{sql_str(r['dataset'])},"
            f"{sql_str(r['unit'])},{sql_str(r['spacecraft'])},{r['rows']},{_ts(r['ingest_at'])},"
            f"{sql_str(r['status'])},true,{bf}) ON CONFLICT (env_id,business_id,run_key) DO NOTHING;")
    for r in channels:
        L.append(
            "INSERT INTO tel_telemetry_channels (id,env_id,business_id,run_id,channel_name,unit,"
            "is_backfilled,backfill_batch_id) VALUES ("
            f"{sql_str(r['id'])},{e},{b},{sql_str(r['run_id'])},{sql_str(r['name'])},"
            f"{sql_str(r['unit'])},true,{bf}) ON CONFLICT (env_id,business_id,run_id,channel_name) DO NOTHING;")
    for r in predictions:
        L.append(
            "INSERT INTO tel_predictions (id,env_id,business_id,run_id,channel_name,window_start_t,"
            "window_end_t,anomaly_score,threshold,verdict,model_name,model_version,mlflow_run_id,"
            "attribution,created_at,is_backfilled,backfill_batch_id) VALUES ("
            f"{sql_str(r['id'])},{e},{b},{sql_str(r['run_id'])},{sql_str(r['channel'])},{r['wstart']},"
            f"{r['wend']},{r['score']},{r['threshold']},{sql_str(r['verdict'])},{sql_str(r['model'])},"
            f"{sql_str(r['version'])},{sql_str(r['mlflow'])},{sql_str(r['attribution'])}::jsonb,"
            f"{_ts(r['created_at'])},true,{bf});")
    for r in events:
        L.append(
            "INSERT INTO tel_anomaly_events (id,env_id,business_id,run_id,channel_name,start_t,end_t,"
            "anomaly_class,confidence,source,created_at,is_backfilled,backfill_batch_id) VALUES ("
            f"{sql_str(r['id'])},{e},{b},{sql_str(r['run_id'])},{sql_str(r['channel'])},{r['start_t']},"
            f"{r['end_t']},{sql_str(r['klass'])},{r['conf']},{sql_str(r['source'])},{_ts(r['created_at'])},"
            f"true,{bf});")
    for r in drift:
        L.append(
            "INSERT INTO tel_drift_metrics (id,env_id,business_id,model_name,metric_name,metric_value,"
            "window_label,computed_at,is_backfilled,backfill_batch_id) VALUES ("
            f"{sql_str(r['id'])},{e},{b},{sql_str(r['model'])},{sql_str(r['metric'])},{r['value']},"
            f"{sql_str(r['window'])},{_ts(r['ts'])},true,{bf});")
    L.append("COMMIT;")
    L.append(f"SELECT 'backfill applied' AS status, "
             f"(SELECT count(*) FROM tel_test_runs WHERE env_id='{ENV_ID}') AS runs, "
             f"(SELECT count(*) FROM tel_predictions WHERE env_id='{ENV_ID}') AS predictions, "
             f"(SELECT count(*) FROM tel_anomaly_events WHERE env_id='{ENV_ID}') AS events, "
             f"(SELECT count(*) FROM tel_drift_metrics WHERE env_id='{ENV_ID}') AS drift;")
    OUT.write_text("\n".join(L), encoding="utf-8")


def print_samples(test_runs, channels, predictions, events, drift):
    print("\n=== TRACEABILITY: 5 sample rows per table (source -> value) ===")
    print("-- tel_test_runs (real channel/unit + real row_count):")
    for r in test_runs[:5]:
        print(f"   {r['run_key']:28} dataset={r['dataset']:9} rows={r['rows']:6} src=gold_{r['dataset']}")
    print("-- tel_predictions (real champion score over real window):")
    for r in predictions[:5]:
        print(f"   run={r['run_key'] if 'run_key' in r else r['run_id'][:8]} t[{r['wstart']}..{r['wend']}] "
              f"score={r['score']:.4f} thr={r['threshold']} -> {r['verdict']}  (peak_resid from gold_smap_msl_windows)")
    print("-- tel_anomaly_events (real NASA labels + model fires):")
    for r in events[:5]:
        print(f"   t[{r['start_t']}..{r['end_t']}] class={r['klass']:10} source={r['source']:6} conf={r['conf']}")
    print("-- tel_drift_metrics (real PSI/rolling-rate):")
    for r in drift[:5]:
        print(f"   {r['metric']:20} value={r['value']:.4f} window={r['window']}")
    print("-- tel_model_runs: UNCHANGED (4 real MLflow models preserved).")


def _fetch_all(client, sql: str):
    """execute_sql with chunked result fetch (the 12_export pattern)."""
    resp = client.execute_sql(sql, wait=True)
    state = resp.get("status", {}).get("state")
    if state not in ("SUCCEEDED", "FINISHED"):
        raise RuntimeError(f"SQL not OK ({state}): {sql[:120]} :: {resp.get('status')}")
    rows = resp.get("result", {}).get("data_array", []) or []
    total = resp.get("manifest", {}).get("total_row_count", len(rows))
    sid = resp.get("statement_id")
    chunks = resp.get("manifest", {}).get("chunks", [])
    if sid and len(rows) < total and len(chunks) > 1:
        for ch in chunks[1:]:
            more = client._request("GET", f"/api/2.0/sql/statements/{sid}/result/chunks/{ch['chunk_index']}")
            rows.extend(more.get("data_array", []) or [])
    return rows


if __name__ == "__main__":
    sys.exit(main())
