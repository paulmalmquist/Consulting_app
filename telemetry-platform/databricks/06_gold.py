"""
Gold — model-ready feature/label tables + the deterministic replay feed.

===== TEACHING NOTES (plain language) =====
WHAT THIS FILE DOES:
  "Gold" is the last, model-ready layer of the data pipeline (bronze = raw, silver = cleaned, gold =
  feature-engineered). It turns cleaned sensor rows into the exact columns every telemetry model trains
  and scores on: rolling averages, spreads, min/max, and rate-of-change over a recent window of readings.
  These derived "features" are what let a model see a trend instead of one isolated number.

WHERE YOU SEE THIS:
  This is the foundation behind the Runs, Monitoring, and Model Performance pages — every prediction
  shown there was computed from these gold tables. gold_replay_feed specifically drives the demo REPLAY
  (one fixed channel's history streamed back tick by tick).

INPUTS -> OUTPUT:
  INPUT  : silver_cmapss / silver_smap_msl (cleaned readings) + silver_smap_msl_labels (true anomaly
           windows).
  OUTPUT : gold_cmapss_features (RUL features + label), gold_smap_msl_windows (anomaly features + the
           is_anomaly truth flag), gold_replay_feed (one channel's test sequence for the demo).

HOW TO READ IT / KEY IDEA:
  - look-ahead / leakage : the cardinal sin of time-series ML — letting a feature at time t peek at data
    from AFTER t (the future). If that happens, the model looks brilliant in testing and fails in the
    real world, where the future isn't available. Every rolling window below is built to NEVER look
    forward (see NO-LOOK-AHEAD ENFORCEMENT). The RUL label is carried alongside, never fed in as an input.

NO-LOOK-AHEAD ENFORCEMENT:
  Every rolling feature uses a window frame `ROWS BETWEEN n PRECEDING AND CURRENT ROW` partitioned by
  the series key and ordered by the time index. No frame ever references FOLLOWING rows, so a feature
  at time t is a function of times <= t only. Lag features use LAG(...) (strictly past). The C-MAPSS
  rul_target is carried as a label, never fed into a same-row feature.

Gold tables:
  gold_cmapss_features    per (subset,unit,cycle): rolling mean/std/min/max, rate-of-change, lag on a
                          set of informative sensors; rul_target label (train rows).
  gold_smap_msl_windows   per (chan_id,split,t): value + rolling features + is_anomaly flag derived
                          from the labeled anomaly windows (test split is the evaluation target).
  gold_replay_feed        one deterministic channel's full TEST sequence with features + is_anomaly,
                          ordered by t — the foundation the demo replay reads. Fixed channel so the
                          replay is identical every run.

Run: python 06_gold.py
"""

import sys

from _bootstrap import get_client, TEL

# A fixed channel for the deterministic demo replay. D-4 (MSL) has a labeled anomaly window that the
# promoted MAD detector actually fires inside (verified: 3,248 model-fired ticks within its labeled
# anomalies), so the demo's go/no-go flip is the model's own output — not a hand-authored flag.
REPLAY_CHANNEL = "D-4"

# Sensors that actually vary in C-MAPSS (several are constant); pick a representative informative set.
CMAPSS_FEATURE_SENSORS = [2, 3, 4, 7, 11, 12, 15]


def _roll(col: str, n: int, fn: str, part: str, order: str) -> str:
    # Build one rolling-window feature in SQL. "ROWS BETWEEN n PRECEDING AND CURRENT ROW" is the
    # no-look-ahead guarantee in code form: it only ever averages/spreads the CURRENT row and the n rows
    # BEFORE it — never anything after. This is how a feature at time t stays a function of times <= t.
    return (f"{fn}({col}) OVER (PARTITION BY {part} ORDER BY {order} "
            f"ROWS BETWEEN {n} PRECEDING AND CURRENT ROW)")


def cmapss_feature_sql() -> str:
    # For each engine, turn each sensor into a small panel of trend features the RUL model can read:
    # a 5-cycle rolling mean/std/min/max (recent level + how jittery + the recent envelope) and a
    # rate-of-change vs the previous cycle (is it climbing or falling). These are the inputs behind the
    # RUL predictions on the Model Performance / Runs pages.
    # Partition by (subset, split, unit): a train unit and a test unit can share (subset,unit),
    # so split MUST be in the partition or rolling features leak across the train/test boundary.
    part = "subset,split,unit"
    parts = []
    for s in CMAPSS_FEATURE_SENSORS:
        col = f"sensor_{s}"
        parts.append(f"{_roll(col, 4, 'avg', part, 'cycle')} AS {col}_rmean5")
        parts.append(f"{_roll(col, 4, 'stddev', part, 'cycle')} AS {col}_rstd5")
        parts.append(f"{_roll(col, 4, 'min', part, 'cycle')} AS {col}_rmin5")
        parts.append(f"{_roll(col, 4, 'max', part, 'cycle')} AS {col}_rmax5")
        parts.append(f"({col} - LAG({col}) OVER (PARTITION BY {part} ORDER BY cycle)) "
                     f"AS {col}_roc")
    return ",\n      ".join(parts)


def gold_statements() -> list:
    return [
        # TABLE 1: gold_cmapss_features — the model-ready RUL training/scoring table. One row per
        # (engine, cycle) with the raw informative sensors PLUS the rolling trend features above, and the
        # rul_target label. This is the input the RUL champion/challenger notebooks read.
        f"DROP TABLE IF EXISTS {TEL}.gold_cmapss_features",
        f"""
        CREATE TABLE {TEL}.gold_cmapss_features AS
        SELECT subset, split, unit, cycle, max_cycle, rul_target,
          {", ".join(f"sensor_{s}" for s in CMAPSS_FEATURE_SENSORS)},
          {cmapss_feature_sql()}
        FROM {TEL}.silver_cmapss
        """,
        f"""COMMENT ON TABLE {TEL}.gold_cmapss_features IS
            'Gold: C-MAPSS model-ready RUL features. Rolling stats use ROWS BETWEEN 4 PRECEDING AND
             CURRENT ROW (no look-ahead). rul_target is the train label. Telemetry Platform.'""",

        # TABLE 2: gold_smap_msl_windows — the anomaly-detection feature table. Each spacecraft channel
        # reading gets a 50-step rolling mean/std/min/max + rate-of-change (so a model can tell "this
        # value is far from its recent normal"), and an is_anomaly flag set to 1 when the reading falls
        # inside a real NASA-labeled anomaly window. is_anomaly is the GROUND TRUTH the Monitoring /
        # Model Performance pages score detections against.
        # SMAP/MSL: features + is_anomaly derived from labeled windows (test split only has labels).
        f"DROP TABLE IF EXISTS {TEL}.gold_smap_msl_windows",
        f"""
        CREATE TABLE {TEL}.gold_smap_msl_windows AS
        WITH feats AS (
          SELECT chan_id, spacecraft, split, t, value,
            {_roll('value', 49, 'avg', 'chan_id,split', 't')}    AS value_rmean50,
            {_roll('value', 49, 'stddev', 'chan_id,split', 't')} AS value_rstd50,
            {_roll('value', 49, 'min', 'chan_id,split', 't')}    AS value_rmin50,
            {_roll('value', 49, 'max', 'chan_id,split', 't')}    AS value_rmax50,
            (value - LAG(value) OVER (PARTITION BY chan_id,split ORDER BY t)) AS value_roc
          FROM {TEL}.silver_smap_msl
        ),
        windows AS (
          SELECT chan_id, w.start_idx, w.end_idx
          FROM {TEL}.silver_smap_msl_labels
          LATERAL VIEW explode(from_json(anomaly_sequences, 'array<array<int>>')) e AS seq
          LATERAL VIEW inline(array(struct(seq[0] AS start_idx, seq[1] AS end_idx))) w
        )
        SELECT f.*,
          CASE WHEN f.split = 'test' AND EXISTS (
            SELECT 1 FROM windows w
            WHERE w.chan_id = f.chan_id AND f.t BETWEEN w.start_idx AND w.end_idx
          ) THEN 1 ELSE 0 END AS is_anomaly
        FROM feats f
        """,
        f"""COMMENT ON TABLE {TEL}.gold_smap_msl_windows IS
            'Gold: SMAP/MSL model-ready anomaly features. Rolling stats use ROWS BETWEEN 49 PRECEDING
             AND CURRENT ROW (no look-ahead). is_anomaly is the labeled target on the test split.
             Telemetry Platform.'""",

        # TABLE 3: gold_replay_feed — the demo's tape. It's just one fixed channel's (D-4) test sequence,
        # in time order, with its features and the is_anomaly truth. The frontend replays this tick by tick
        # so the live demo behaves identically every single run (no randomness, fully reproducible).
        # Deterministic replay feed: one fixed channel's test sequence, ordered, with features+label.
        f"DROP TABLE IF EXISTS {TEL}.gold_replay_feed",
        f"""
        CREATE TABLE {TEL}.gold_replay_feed AS
        SELECT chan_id, spacecraft, t, value,
               value_rmean50, value_rstd50, value_rmin50, value_rmax50, value_roc, is_anomaly
        FROM {TEL}.gold_smap_msl_windows
        WHERE chan_id = '{REPLAY_CHANNEL}' AND split = 'test'
        ORDER BY t
        """,
        f"""COMMENT ON TABLE {TEL}.gold_replay_feed IS
            'Gold: deterministic demo replay feed = channel {REPLAY_CHANNEL} (SMAP) test sequence with
             no-look-ahead features and the labeled is_anomaly flag, ordered by t. The fixed channel
             makes the replay identical every run. Telemetry Platform.'""",
    ]


def main() -> int:
    client = get_client()
    client.start_warehouse(); client.wait_for_warehouse("RUNNING", 300)
    try:
        for stmt in gold_statements():
            resp = client.execute_sql(stmt)
            state = resp.get("status", {}).get("state")
            label = stmt.strip().split("\n", 1)[0][:60]
            if state not in ("SUCCEEDED", "FINISHED"):
                print(f"[gold] FAIL state={state} on: {label}")
                print(resp.get("status"))
                return 2

        def q1(sql):
            return client.execute_sql(sql).get("result", {}).get("data_array", [["?"]])[0]

        for tbl in ("gold_cmapss_features", "gold_smap_msl_windows", "gold_replay_feed"):
            print(f"[gold] {tbl}: rows={q1(f'SELECT count(*) FROM {TEL}.{tbl}')[0]}")

        # Replay-feed sanity: must have rows and at least one labeled anomaly tick.
        rf = q1(f"SELECT count(*), sum(is_anomaly), min(t), max(t) FROM {TEL}.gold_replay_feed")
        print(f"[gold] replay_feed: rows={rf[0]} anomaly_ticks={rf[1]} t=[{rf[2]}..{rf[3]}]")
        if int(rf[0]) == 0 or int(rf[1] or 0) == 0:
            print("[gold] FAIL — replay feed empty or has no labeled anomaly tick.")
            return 3

        # Anomaly base rate on the test split (real, for honest reporting).
        ar = q1(f"SELECT avg(is_anomaly) FROM {TEL}.gold_smap_msl_windows WHERE split='test'")
        print(f"[gold] test-split anomaly base rate: {ar[0]}")
        print("[gold] PASS")
        return 0
    finally:
        client.stop_warehouse()


if __name__ == "__main__":
    sys.exit(main())
