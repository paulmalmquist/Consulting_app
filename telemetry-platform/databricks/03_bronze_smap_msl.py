"""
Bronze — NASA/JPL SMAP & MSL telemetry (Telemanom).

Two Bronze tables:
  novendor_1.telemetry.bronze_smap_msl_labels
     one row per labeled channel: chan_id, spacecraft, anomaly_sequences (JSON string),
     class (point/contextual JSON string), num_values.
  novendor_1.telemetry.bronze_smap_msl_telemetry
     one row per (chan_id, split, timestep): the telemetry value (column 0 of each .npy).
     The remaining 24 columns are one-hot command encodings and are not carried into Bronze value
     rows (they belong to feature engineering, not the raw signal).

Raw/as-landed. Anomaly-window labels are kept verbatim as strings; parsing into typed windows is
Silver/Gold work.

Run: python 03_bronze_smap_msl.py
"""

import csv
import gzip
import sys
import tempfile
from pathlib import Path

import numpy as np

from _bootstrap import get_client, TEL
from _volume import ensure_volume, upload_file, VOLUME_ROOT

DATA = Path(__file__).resolve().parent / "data" / "smap_msl"
LABELS = DATA / "labeled_anomalies.csv"
ARRAYS = DATA / "arrays"


def build_labels_csv(tmp: Path) -> tuple[Path, int]:
    rows = list(csv.DictReader(open(LABELS, encoding="utf-8")))
    out = tmp / "bronze_labels.csv.gz"
    with gzip.open(out, "wt", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["chan_id", "spacecraft", "anomaly_sequences", "anomaly_class", "num_values"])
        for r in rows:
            w.writerow([r["chan_id"], r["spacecraft"], r["anomaly_sequences"],
                        r["class"], r["num_values"]])
    return out, len(rows)


def build_telemetry_csv(tmp: Path) -> tuple[Path, int, int]:
    """Flatten every .npy (column 0 = telemetry value) into (chan_id, split, t, value)."""
    out = tmp / "bronze_telemetry.csv.gz"
    n_rows = 0
    n_channels = 0
    with gzip.open(out, "wt", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["chan_id", "split", "t", "value"])
        for split in ("train", "test"):
            for npy in sorted((ARRAYS / split).glob("*.npy")):
                arr = np.load(npy)
                vals = arr[:, 0] if arr.ndim == 2 else arr.ravel()
                chan = npy.stem
                for t, v in enumerate(vals):
                    w.writerow([chan, split, t, float(v)])
                    n_rows += 1
                n_channels += 1
    return out, n_rows, n_channels


def _create(client, table: str, path: str, comment: str) -> None:
    fq = f"{TEL}.{table}"
    client.execute_sql(f"DROP TABLE IF EXISTS {fq}")
    resp = client.execute_sql(
        f"CREATE TABLE {fq} AS SELECT * FROM read_files('{path}', format => 'csv', "
        f"header => true, inferSchema => true)"
    )
    state = resp.get("status", {}).get("state")
    cnt = client.execute_sql(f"SELECT count(*) FROM {fq}")
    n = cnt.get("result", {}).get("data_array", [["?"]])[0][0]
    print(f"[bronze_smap_msl] {table}: create={state}  rows={n}")
    client.execute_sql(f"COMMENT ON TABLE {fq} IS '{comment}'")


def main() -> int:
    if not LABELS.exists() or not ARRAYS.exists():
        print("[bronze_smap_msl] data missing — run download_smap_msl.py first.")
        return 1

    tmp = Path(tempfile.mkdtemp(prefix="tel_smap_"))
    labels_csv, n_labels = build_labels_csv(tmp)
    print(f"[bronze_smap_msl] labels parsed: {n_labels} channels")
    tel_csv, n_tel, n_chan = build_telemetry_csv(tmp)
    print(f"[bronze_smap_msl] telemetry parsed: {n_tel} rows across {n_chan} channel-splits")

    client = get_client()
    client.start_warehouse(); client.wait_for_warehouse("RUNNING", 300)
    try:
        ensure_volume(client)
        dl = upload_file(client, str(labels_csv), "smap_msl/bronze_labels.csv.gz")
        dt = upload_file(client, str(tel_csv), "smap_msl/bronze_telemetry.csv.gz")
        print(f"[bronze_smap_msl] staged labels -> {dl}")
        print(f"[bronze_smap_msl] staged telemetry -> {dt}")

        _create(client, "bronze_smap_msl_labels", dl,
                 "Bronze: SMAP/MSL labeled anomaly windows (public NASA/JPL telemanom). "
                 "Owning module: Telemetry Platform.")
        _create(client, "bronze_smap_msl_telemetry", dt,
                 "Bronze: SMAP/MSL raw telemetry values per channel/split/timestep "
                 "(public NASA/JPL telemanom). Owning module: Telemetry Platform.")
        print("[bronze_smap_msl] PASS")
        return 0
    finally:
        client.stop_warehouse()


if __name__ == "__main__":
    sys.exit(main())
