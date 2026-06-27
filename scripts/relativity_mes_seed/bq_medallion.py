"""Relativity MES Sandbox — BigQuery medallion (GCP-native fallback for the Databricks warehouse).

BigQuery is serverless (no SQL warehouse to provision, so no RESOURCE_EXHAUSTED). This stands up the
same medallion shape as the Databricks one, in BigQuery dataset `relativity_mes`:

  bronze_rel_*   raw landing of the deterministic synthetic source (loaded from NDJSON)
  silver_rel_*   conformed views (synthetic-only data contract)
  gold_<mart>    the five gold marts (loaded; the generator is the gold transform — see ADR 0002)

Then it validates the demo invariants directly in BigQuery (3 vehicles, suspect lot on exactly two
vehicles, an open major NCR, a reconciliation exception). All data is SYNTHETIC.

Run: CLOUDSDK_PYTHON=<python> python -m scripts.relativity_mes_seed.bq_medallion
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

_BQ = shutil.which("bq") or "bq"
# On Windows bq resolves to bq.CMD, which CreateProcess can't exec directly — go through cmd /c.
_LAUNCH = (["cmd", "/c", _BQ] if _BQ.lower().endswith((".cmd", ".bat")) else [_BQ])

from .generate import SUSPECT_LOT, build_dataset
from .emit import SERVING_MAP

PROJECT = "novendor-events-prod"
DATASET = "relativity_mes"
LOCATION = "US"
NS = f"{PROJECT}:{DATASET}"
FQ = f"{PROJECT}.{DATASET}"


def _bq(args: list[str], sql: str | None = None) -> str:
    env = dict(os.environ)
    env.setdefault("CLOUDSDK_PYTHON", sys.executable)
    cmd = [*_LAUNCH, f"--project_id={PROJECT}", *args]
    res = subprocess.run(cmd, input=sql, capture_output=True, text=True, env=env)
    if res.returncode != 0:
        raise RuntimeError(f"bq failed: {' '.join(cmd)}\n{res.stderr.strip()[:600]}")
    return res.stdout.strip()


def _query(sql: str) -> list[dict]:
    out = _bq(["query", "--use_legacy_sql=false", "--format=json", "--quiet"], sql=sql)
    return json.loads(out) if out else []


def _write_ndjson(rows: list[dict], path: Path) -> None:
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, default=str) + "\n")


def _load(table: str, rows: list[dict], tmp: Path) -> None:
    if not rows:
        print(f"  skip {table} (no rows)")
        return
    f = tmp / f"{table}.ndjson"
    _write_ndjson(rows, f)
    _bq(["load", "--source_format=NEWLINE_DELIMITED_JSON", "--autodetect", "--replace",
         f"{DATASET}.{table}", str(f)])
    print(f"  loaded {table}: {len(rows)} rows")


def main() -> int:
    ds = build_dataset()
    src, gold = ds["source"], ds["gold"]

    # dataset (idempotent)
    try:
        _bq(["mk", "--dataset", f"--location={LOCATION}", NS])
        print(f"created dataset {NS}")
    except RuntimeError as e:
        if "already exists" in str(e).lower():
            print(f"dataset {NS} exists")
        else:
            raise

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        print("bronze: landing synthetic source …")
        for t, rows in src.items():
            _load(f"bronze_{t}", rows, tmp)

        print("gold: materializing the five marts …")
        for mart, serving in SERVING_MAP.items():
            _load(f"gold_{serving}", gold[mart], tmp)

    print("silver: conforming (views, synthetic-only contract) …")
    for t in src:
        _bq(["query", "--use_legacy_sql=false", "--quiet"],
            sql=f"CREATE OR REPLACE VIEW `{FQ}.silver_{t}` AS "
                f"SELECT * FROM `{FQ}.bronze_{t}` WHERE synthetic IS TRUE")
    print(f"  {len(src)} silver views")

    # ---- validate invariants IN BigQuery ----
    veh = int(_query(f"SELECT count(DISTINCT vehicle_serial) AS n FROM `{FQ}.silver_rel_mes_vehicle`")[0]["n"])
    sl = int(_query(f"SELECT count(DISTINCT vehicle_serial) AS n FROM `{FQ}.silver_rel_mes_as_built_genealogy` "
                    f"WHERE lot_no='{SUSPECT_LOT}'")[0]["n"])
    om = int(_query(f"SELECT count(*) AS n FROM `{FQ}.silver_rel_mes_nonconformance` "
                    f"WHERE status='open' AND severity='major'")[0]["n"])
    exc = int(_query(f"SELECT count(*) AS n FROM `{FQ}.gold_rel_mes_erp_reconciliation` "
                     f"WHERE reconciliation_status='exception'")[0]["n"])
    print(f"VALIDATE  vehicles={veh}  suspect_lot_vehicles={sl}  open_major_ncr={om}  exceptions={exc}")
    assert veh == 3, f"expected 3 vehicles, got {veh}"
    assert sl == 2, f"suspect lot must affect exactly 2 vehicles, got {sl}"
    assert om >= 1, "expected an open major NCR"
    assert exc >= 1, "expected a reconciliation exception"

    print(f"\nBigQuery medallion ready: {FQ} "
          f"({len(src)} bronze + {len(src)} silver + {len(gold)} gold). Serverless — no warehouse.")
    print(f"Console: https://console.cloud.google.com/bigquery?project={PROJECT}&ws=!1m4!1m3!3m2!1s{PROJECT}!2s{DATASET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
