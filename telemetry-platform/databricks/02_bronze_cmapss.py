"""
Bronze — C-MAPSS Turbofan Degradation.

Parses the 4 subsets (FD001-FD004) train + test text files into one tidy table and the RUL files into
a second, stages them to the Unity Catalog volume as gzipped CSV, and creates Delta tables via
read_files. Raw/as-landed: no feature engineering here (that is Silver/Gold).

C-MAPSS row format (space-delimited, 26 fields):
  unit  cycle  op_setting_1 op_setting_2 op_setting_3  sensor_1 ... sensor_21

Tables created:
  novendor_1.telemetry.bronze_cmapss      (subset, split, unit, cycle, 3 settings, 21 sensors)
  novendor_1.telemetry.bronze_cmapss_rul  (subset, unit, rul)  -- final-RUL truth for test units

Run: python 02_bronze_cmapss.py
"""

import gzip
import sys
import tempfile
from pathlib import Path

import pandas as pd

from _bootstrap import get_client, TEL
from _volume import ensure_volume, upload_file, VOLUME_ROOT

DATA = Path(__file__).resolve().parent / "data" / "cmapss"
SUBSETS = ["FD001", "FD002", "FD003", "FD004"]
SENSOR_COLS = [f"sensor_{i}" for i in range(1, 22)]
COLS = ["unit", "cycle", "op_setting_1", "op_setting_2", "op_setting_3"] + SENSOR_COLS


def _read_run_file(path: Path, subset: str, split: str) -> pd.DataFrame:
    df = pd.read_csv(path, sep=r"\s+", header=None, engine="python")
    df = df.iloc[:, : len(COLS)]
    df.columns = COLS
    df.insert(0, "split", split)
    df.insert(0, "subset", subset)
    return df


def build_local_csvs(tmp: Path) -> tuple[Path, Path, int, int]:
    runs, ruls = [], []
    for sub in SUBSETS:
        for split in ("train", "test"):
            p = DATA / f"{split}_{sub}.txt"
            if p.exists():
                runs.append(_read_run_file(p, sub, split))
        rp = DATA / f"RUL_{sub}.txt"
        if rp.exists():
            r = pd.read_csv(rp, sep=r"\s+", header=None, engine="python")
            rdf = pd.DataFrame({"subset": sub, "unit": range(1, len(r) + 1), "rul": r.iloc[:, 0]})
            ruls.append(rdf)

    runs_df = pd.concat(runs, ignore_index=True)
    rul_df = pd.concat(ruls, ignore_index=True)

    runs_csv = tmp / "bronze_cmapss.csv.gz"
    rul_csv = tmp / "bronze_cmapss_rul.csv.gz"
    with gzip.open(runs_csv, "wt", newline="", encoding="utf-8") as f:
        runs_df.to_csv(f, index=False)
    with gzip.open(rul_csv, "wt", newline="", encoding="utf-8") as f:
        rul_df.to_csv(f, index=False)
    return runs_csv, rul_csv, len(runs_df), len(rul_df)


def main() -> int:
    if not DATA.exists():
        print("[bronze_cmapss] data/cmapss missing — run download_cmapss.py first.")
        return 1

    tmp = Path(tempfile.mkdtemp(prefix="tel_cmapss_"))
    runs_csv, rul_csv, n_runs, n_rul = build_local_csvs(tmp)
    print(f"[bronze_cmapss] parsed locally: {n_runs} run rows, {n_rul} RUL rows")

    client = get_client()
    client.start_warehouse(); client.wait_for_warehouse("RUNNING", 300)
    try:
        ensure_volume(client)
        d1 = upload_file(client, str(runs_csv), "cmapss/bronze_cmapss.csv.gz")
        d2 = upload_file(client, str(rul_csv), "cmapss/bronze_cmapss_rul.csv.gz")
        print(f"[bronze_cmapss] staged -> {d1}")
        print(f"[bronze_cmapss] staged -> {d2}")

        for table, path in (("bronze_cmapss", d1), ("bronze_cmapss_rul", d2)):
            fq = f"{TEL}.{table}"
            client.execute_sql(f"DROP TABLE IF EXISTS {fq}")
            sql = (
                f"CREATE TABLE {fq} AS "
                f"SELECT * FROM read_files('{path}', format => 'csv', header => true, "
                f"inferSchema => true)"
            )
            resp = client.execute_sql(sql)
            state = resp.get("status", {}).get("state")
            cnt = client.execute_sql(f"SELECT count(*) FROM {fq}")
            n = cnt.get("result", {}).get("data_array", [["?"]])[0][0]
            print(f"[bronze_cmapss] {table}: create={state}  rows={n}")
            client.execute_sql(
                f"COMMENT ON TABLE {fq} IS "
                f"'Bronze: raw C-MAPSS {table.replace('bronze_cmapss','').strip('_') or 'sensor readings'} "
                f"(public NASA PCoE analog). Owning module: Telemetry Platform.'"
            )
        print("[bronze_cmapss] PASS")
        return 0
    finally:
        client.stop_warehouse()


if __name__ == "__main__":
    sys.exit(main())
