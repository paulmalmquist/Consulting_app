"""
Bronze — NASA PCoE / IMS Bearing Run-to-Failure (provenance only, Phase 1).

The IMS dataset is a 1.075 GB zip (phm-datasets S3) wrapping a nested IMS.7z that holds three
run-to-failure RAR archives (1st/2nd/3rd_test) plus a Readme PDF. The archive was downloaded and
verified real (magic bytes + 7z listing). Full vibration feature engineering requires a triple-nested
zip->7z->rar extraction of ~1 GB and does not gate the Phase 1 replay demo, so it is deferred.

Bronze records the verified provenance so the lineage is honest and queryable. The row count of the
underlying vibration snapshots is recorded as a known follow-up, not faked.

Run: python 04_bronze_ims.py
"""

import csv
import gzip
import json
import sys
import tempfile
from pathlib import Path

from _bootstrap import get_client, TEL
from _volume import ensure_volume, upload_file

DATA = Path(__file__).resolve().parent / "data"
MANIFEST = DATA / "ims" / "manifest_ims.json" if (DATA / "ims" / "manifest_ims.json").exists() \
    else DATA / "manifest_ims.json"


def main() -> int:
    if not MANIFEST.exists():
        print("[bronze_ims] manifest_ims.json missing — run download_ims.py first.")
        return 1
    m = json.loads(MANIFEST.read_text())

    tmp = Path(tempfile.mkdtemp(prefix="tel_ims_"))
    out = tmp / "bronze_ims.csv.gz"
    with gzip.open(out, "wt", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["archive_name", "bytes", "status", "note"])
        outer = m.get("outer_zip", {})
        w.writerow([outer.get("path", "4.+Bearings.zip"), outer.get("bytes", 0),
                    m.get("status", "archive_verified"),
                    "outer zip; sha256=" + outer.get("sha256", "")[:32]])
        for inner in m.get("inner_7z_contents", []):
            w.writerow([inner["name"], inner["bytes"], "deferred_extraction",
                        "nested in IMS.7z; vibration features deferred beyond Phase 1"])

    client = get_client()
    client.start_warehouse(); client.wait_for_warehouse("RUNNING", 300)
    try:
        ensure_volume(client)
        d = upload_file(client, str(out), "ims/bronze_ims.csv.gz")
        print(f"[bronze_ims] staged -> {d}")
        fq = f"{TEL}.bronze_ims"
        client.execute_sql(f"DROP TABLE IF EXISTS {fq}")
        resp = client.execute_sql(
            f"CREATE TABLE {fq} AS SELECT * FROM read_files('{d}', format => 'csv', "
            f"header => true, inferSchema => true)"
        )
        state = resp.get("status", {}).get("state")
        cnt = client.execute_sql(f"SELECT count(*) FROM {fq}")
        n = cnt.get("result", {}).get("data_array", [["?"]])[0][0]
        print(f"[bronze_ims] bronze_ims: create={state}  rows={n}")
        client.execute_sql(
            f"COMMENT ON TABLE {fq} IS "
            f"'Bronze: IMS bearing archive provenance (public NASA PCoE). Verified 1.075GB archive; "
            f"vibration feature engineering deferred beyond Phase 1. Owning module: Telemetry Platform.'"
        )
        print("[bronze_ims] PASS (provenance recorded; extraction deferred)")
        return 0
    finally:
        client.stop_warehouse()


if __name__ == "__main__":
    sys.exit(main())
