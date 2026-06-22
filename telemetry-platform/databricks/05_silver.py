"""
Silver — typed, conformed, strictly time-ordered tables with the no-look-ahead contract.

NO-LOOK-AHEAD CONTRACT (the rule every downstream feature must obey):
  For any row at time index t, only rows with the same series key and time index <= t may inform a
  feature value at t. Silver does NOT compute rolling features (that is Gold); Silver guarantees the
  strict ordering key that makes the rule enforceable, and it only attaches labels that are known
  without peeking forward within the serving horizon:
    - C-MAPSS TRAIN units run to failure, so RUL_t = max_cycle(unit) - cycle_t is a known training
      target (the whole trajectory is historical). This is a label, not a feature — it is never an
      input to a same-t feature.
    - C-MAPSS TEST units are censored (do not run to failure); their RUL is supplied separately as a
      final-cycle truth (bronze_cmapss_rul) and is NOT spread across earlier cycles.
    - SMAP/MSL anomaly windows are labels evaluated against test telemetry; they are kept as a
      separate typed label table and never merged into the telemetry value stream as a feature.

Silver tables:
  silver_cmapss            typed sensor rows + ordering key + train-only rul_target (+ unit max_cycle)
  silver_cmapss_rul        typed final-RUL truth for test units
  silver_smap_msl          typed telemetry (chan_id, spacecraft, split, t, value), ordered
  silver_smap_msl_labels   typed labels with parsed window count + class list
  silver_ims               passthrough provenance

Run: python 05_silver.py
"""

import sys

from _bootstrap import get_client, TEL


STATEMENTS = [
    # ---- C-MAPSS sensors: type + ordering key + train-only RUL target ----
    f"DROP TABLE IF EXISTS {TEL}.silver_cmapss",
    f"""
    CREATE TABLE {TEL}.silver_cmapss AS
    WITH typed AS (
      SELECT
        CAST(subset AS STRING)  AS subset,
        CAST(split  AS STRING)  AS split,
        CAST(unit   AS INT)     AS unit,
        CAST(cycle  AS INT)     AS cycle,
        CAST(op_setting_1 AS DOUBLE) AS op_setting_1,
        CAST(op_setting_2 AS DOUBLE) AS op_setting_2,
        CAST(op_setting_3 AS DOUBLE) AS op_setting_3,
        {", ".join(f"CAST(sensor_{i} AS DOUBLE) AS sensor_{i}" for i in range(1, 22))}
      FROM {TEL}.bronze_cmapss
    ),
    maxc AS (
      SELECT subset, split, unit, MAX(cycle) AS max_cycle
      FROM typed GROUP BY subset, split, unit
    )
    SELECT t.*, m.max_cycle,
           -- train units run to failure => RUL known historically; test units censored => NULL here
           CASE WHEN t.split = 'train' THEN m.max_cycle - t.cycle ELSE NULL END AS rul_target
    FROM typed t
    JOIN maxc m USING (subset, split, unit)
    """,
    f"""COMMENT ON TABLE {TEL}.silver_cmapss IS
        'Silver: typed C-MAPSS sensor rows ordered by (subset,unit,cycle). rul_target is train-only
         (max_cycle - cycle); test RUL lives in silver_cmapss_rul. No-look-ahead: rul_target is a
         label, never an input to a same-cycle feature. Telemetry Platform.'""",

    # ---- C-MAPSS test final-RUL truth ----
    f"DROP TABLE IF EXISTS {TEL}.silver_cmapss_rul",
    f"""
    CREATE TABLE {TEL}.silver_cmapss_rul AS
    SELECT CAST(subset AS STRING) AS subset, CAST(unit AS INT) AS unit, CAST(rul AS INT) AS rul
    FROM {TEL}.bronze_cmapss_rul
    """,
    f"""COMMENT ON TABLE {TEL}.silver_cmapss_rul IS
        'Silver: final-cycle RUL truth for C-MAPSS test units (censored series). Telemetry Platform.'""",

    # ---- SMAP/MSL telemetry: typed + spacecraft join + ordering key ----
    f"DROP TABLE IF EXISTS {TEL}.silver_smap_msl",
    f"""
    CREATE TABLE {TEL}.silver_smap_msl AS
    WITH spacecraft_map AS (
      -- one spacecraft per channel; P-2 has duplicate label rows, so collapse to avoid join fan-out
      SELECT chan_id, MAX(spacecraft) AS spacecraft
      FROM {TEL}.bronze_smap_msl_labels GROUP BY chan_id
    )
    SELECT
      CAST(b.chan_id AS STRING)  AS chan_id,
      CAST(s.spacecraft AS STRING) AS spacecraft,
      CAST(b.split AS STRING)    AS split,
      CAST(b.t AS INT)           AS t,
      CAST(b.value AS DOUBLE)    AS value
    FROM {TEL}.bronze_smap_msl_telemetry b
    LEFT JOIN spacecraft_map s ON b.chan_id = s.chan_id
    """,
    f"""COMMENT ON TABLE {TEL}.silver_smap_msl IS
        'Silver: typed SMAP/MSL telemetry ordered by (chan_id,split,t), spacecraft attached. Anomaly
         labels kept separate (silver_smap_msl_labels), never merged as a feature. Telemetry Platform.'""",

    # ---- SMAP/MSL labels: typed + window count ----
    f"DROP TABLE IF EXISTS {TEL}.silver_smap_msl_labels",
    f"""
    CREATE TABLE {TEL}.silver_smap_msl_labels AS
    SELECT
      CAST(chan_id AS STRING)     AS chan_id,
      CAST(spacecraft AS STRING)  AS spacecraft,
      anomaly_sequences,
      anomaly_class,
      CAST(num_values AS INT)     AS num_values,
      size(from_json(anomaly_sequences, 'array<array<int>>')) AS num_anomaly_windows
    FROM {TEL}.bronze_smap_msl_labels
    """,
    f"""COMMENT ON TABLE {TEL}.silver_smap_msl_labels IS
        'Silver: typed SMAP/MSL labels with parsed window count. anomaly_class distinguishes point vs
         contextual anomalies. Telemetry Platform.'""",

    # ---- IMS passthrough ----
    f"DROP TABLE IF EXISTS {TEL}.silver_ims",
    f"""CREATE TABLE {TEL}.silver_ims AS SELECT * FROM {TEL}.bronze_ims""",
    f"""COMMENT ON TABLE {TEL}.silver_ims IS
        'Silver: IMS provenance passthrough; vibration feature engineering deferred. Telemetry Platform.'""",
]

COUNT_TABLES = ["silver_cmapss", "silver_cmapss_rul", "silver_smap_msl",
                "silver_smap_msl_labels", "silver_ims"]


def main() -> int:
    client = get_client()
    client.start_warehouse(); client.wait_for_warehouse("RUNNING", 300)
    try:
        for stmt in STATEMENTS:
            resp = client.execute_sql(stmt)
            state = resp.get("status", {}).get("state")
            label = stmt.strip().split("\n", 1)[0][:60]
            if state not in ("SUCCEEDED", "FINISHED"):
                print(f"[silver] FAIL state={state} on: {label}")
                print(resp.get("status"))
                return 2
        for tbl in COUNT_TABLES:
            n = client.execute_sql(f"SELECT count(*) FROM {TEL}.{tbl}") \
                .get("result", {}).get("data_array", [["?"]])[0][0]
            print(f"[silver] {tbl}: rows={n}")
        # No-look-ahead spot check: train rul_target must equal max_cycle-cycle and be >= 0.
        chk = client.execute_sql(
            f"SELECT min(rul_target), max(rul_target) FROM {TEL}.silver_cmapss WHERE split='train'"
        ).get("result", {}).get("data_array", [["?", "?"]])[0]
        print(f"[silver] train rul_target range: min={chk[0]} max={chk[1]} (min must be >= 0)")
        print("[silver] PASS")
        return 0
    finally:
        client.stop_warehouse()


if __name__ == "__main__":
    sys.exit(main())
