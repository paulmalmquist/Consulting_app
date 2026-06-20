#!/usr/bin/env python
"""Materialize the ML Algorithm Decision Lab dataset + results to GCP.

Writes BigQuery tables (observations / predictions / eval) and exports model
cards to GCS so the lab's GCP detail links resolve to real resources.

Usage:
    python scripts/ml_demo_materialize.py --dry-run     # show the plan only
    python scripts/ml_demo_materialize.py               # write to BigQuery/GCS

Requires the GCP provider configured:
    ML_DEMO_CLOUD_PROVIDER=gcp
    ML_DEMO_GCP_PROJECT_ID=<project>   (or BQ_PROJECT_ID)
    ML_DEMO_BIGQUERY_DATASET=winston_ml_demo
    ML_DEMO_GCS_BUCKET=<bucket>        (optional, for model cards)
    GOOGLE_APPLICATION_CREDENTIALS=<path/to/sa.json>

Fail-soft: missing config returns a 'skipped' result and exit code 0.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

# Make `app` importable when run from the repo root.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services.hr_ml_demo.materialize import materialize  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Materialize ML demo data to GCP")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    args = parser.parse_args()

    result = materialize(dry_run=args.dry_run)
    print(json.dumps(result, indent=2))
    if result.get("status") == "skipped":
        print(f"\n[skipped] {result.get('reason')}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
