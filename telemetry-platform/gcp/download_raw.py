#!/usr/bin/env python3
"""Download the public NASA telemetry data (Databricks-free) from a committed manifest.

The same public SMAP/MSL (and C-MAPSS) data the Databricks bronze stage used, fetched directly from
its public sources so the GCP pipeline never depends on Databricks. Idempotent + SHA-verified.

Usage:
    python telemetry-platform/gcp/download_raw.py --dataset smap_msl --out <dir>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # telemetry-platform/
MANIFESTS = {
    "smap_msl": ROOT / "databricks" / "data" / "manifest_smap_msl.json",
    "cmapss": ROOT / "databricks" / "data" / "manifest_cmapss.json",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(dataset: str, out: Path) -> dict:
    manifest = MANIFESTS[dataset]
    recs = json.loads(manifest.read_text(encoding="utf-8"))["records"]
    ok = skipped = failed = 0
    t0 = time.time()
    for r in recs:
        dest = out / r["dest"].replace("\\", "/")
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists() and r.get("sha256") and sha256(dest) == r["sha256"]:
            skipped += 1
            continue
        try:
            req = urllib.request.Request(r["url"], headers={"User-Agent": "telemetry-gcp-migration/1.0"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                dest.write_bytes(resp.read())
            if r.get("sha256") and sha256(dest) != r["sha256"]:
                failed += 1
                continue
            ok += 1
        except Exception:  # noqa: BLE001
            failed += 1
    return {"dataset": dataset, "fetched": ok, "cached": skipped, "failed": failed,
            "seconds": round(time.time() - t0, 1), "out": str(out),
            "manifest_sha": sha256(manifest)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default="smap_msl", choices=list(MANIFESTS))
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    res = download(args.dataset, Path(args.out))
    print(json.dumps(res, indent=2))
    return 0 if res["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
