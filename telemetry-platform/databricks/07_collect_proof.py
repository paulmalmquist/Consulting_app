"""
Collect Phase 1 proof: Unity Catalog table inventory, row counts, and one sample row per layer.
Prints machine-copyable evidence for PROOF.md. Read-only.
"""

import json
import sys

from _bootstrap import get_client, TEL, CATALOG, SCHEMA


def main() -> int:
    client = get_client()
    client.start_warehouse(); client.wait_for_warehouse("RUNNING", 300)
    try:
        tables = client.list_tables(SCHEMA).get("tables", [])
        names = sorted(t["name"] for t in tables)
        print(f"## Unity Catalog tables in {CATALOG}.{SCHEMA}\n")
        for n in names:
            cnt = client.execute_sql(f"SELECT count(*) FROM {TEL}.{n}") \
                .get("result", {}).get("data_array", [["?"]])[0][0]
            print(f"- `{CATALOG}.{SCHEMA}.{n}` — {int(cnt):,} rows")

        print("\n## Sample rows\n")
        samples = {
            "bronze_cmapss": f"SELECT subset,split,unit,cycle,sensor_2,sensor_3,sensor_4 FROM {TEL}.bronze_cmapss WHERE subset='FD001' AND unit=1 AND cycle<=2 ORDER BY cycle",
            "silver_cmapss": f"SELECT subset,split,unit,cycle,max_cycle,rul_target,sensor_2 FROM {TEL}.silver_cmapss WHERE subset='FD001' AND split='train' AND unit=1 ORDER BY cycle LIMIT 2",
            "gold_cmapss_features": f"SELECT subset,unit,cycle,rul_target,sensor_2,sensor_2_rmean5,sensor_2_roc FROM {TEL}.gold_cmapss_features WHERE subset='FD001' AND unit=1 ORDER BY cycle LIMIT 3",
            "bronze_smap_msl_telemetry": f"SELECT chan_id,split,t,value FROM {TEL}.bronze_smap_msl_telemetry WHERE chan_id='T-1' AND split='test' ORDER BY t LIMIT 2",
            "gold_smap_msl_windows": f"SELECT chan_id,split,t,value,value_rmean50,value_roc,is_anomaly FROM {TEL}.gold_smap_msl_windows WHERE chan_id='T-1' AND split='test' AND is_anomaly=1 ORDER BY t LIMIT 2",
            "gold_replay_feed": f"SELECT chan_id,t,value,value_rmean50,is_anomaly FROM {TEL}.gold_replay_feed WHERE is_anomaly=1 ORDER BY t LIMIT 2",
            "bronze_ims": f"SELECT archive_name,bytes,status FROM {TEL}.bronze_ims ORDER BY bytes DESC",
        }
        for tbl, sql in samples.items():
            resp = client.execute_sql(sql)
            cols = [c["name"] for c in resp.get("manifest", {}).get("schema", {}).get("columns", [])]
            rows = resp.get("result", {}).get("data_array", [])
            print(f"### {tbl}")
            print(f"cols: {cols}")
            for r in rows:
                print(f"  {r}")
            print()

        # No-look-ahead evidence
        print("## No-look-ahead checks\n")
        chk = client.execute_sql(
            f"SELECT min(rul_target), max(rul_target) FROM {TEL}.silver_cmapss WHERE split='train'"
        ).get("result", {}).get("data_array", [["?", "?"]])[0]
        print(f"- C-MAPSS train rul_target range: min={chk[0]} max={chk[1]} (min >= 0 required)")
        ar = client.execute_sql(
            f"SELECT count(*), sum(is_anomaly), avg(is_anomaly) FROM {TEL}.gold_smap_msl_windows WHERE split='test'"
        ).get("result", {}).get("data_array", [["?", "?", "?"]])[0]
        print(f"- SMAP/MSL test split: rows={ar[0]} anomaly_ticks={ar[1]} base_rate={ar[2]}")
        rf = client.execute_sql(
            f"SELECT count(*), sum(is_anomaly), min(t), max(t) FROM {TEL}.gold_replay_feed"
        ).get("result", {}).get("data_array", [["?"] * 4])[0]
        print(f"- gold_replay_feed (T-1 test): rows={rf[0]} anomaly_ticks={rf[1]} t=[{rf[2]}..{rf[3]}]")
        return 0
    finally:
        client.stop_warehouse()


if __name__ == "__main__":
    sys.exit(main())
