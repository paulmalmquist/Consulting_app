#!/usr/bin/env python
"""Materialize the ML Algorithm Decision Lab dataset + results to GCP.

Writes BigQuery tables (observations / predictions / eval) and exports model
cards to GCS so the lab's GCP detail links resolve to real resources.

===== TEACHING NOTES (plain language) =====
WHAT THIS FILE DOES:
  This is a one-shot publishing script for the ML Algorithm Decision Lab — a
  teaching playground where a user can compare different ML algorithms side by side.
  "Materialize" here just means: take the lab's datasets and the model results and
  write them out to real cloud storage (BigQuery tables + model-card files in GCS)
  so the lab's "view this in GCP" links point at actual, browsable resources instead
  of dead links. This script doesn't train anything itself — it persists what the
  lab produces so the cloud-detail panels have something real to show.

  How the lab itself works (context for what's being materialized): the lab trains
  several SMALL, SYNTHETIC models on demand using a fixed random seed. "Synthetic"
  means the data is generated, not real-world; "fixed seed" means everyone gets the
  exact same numbers every run, so the comparison is reproducible and fair. The
  point is to TEACH algorithm trade-offs (accuracy vs. speed vs. interpretability),
  not to make real predictions. The lab also has a "Reality Mode" that throws
  curveballs at the trained models (shifted/noisier data) to expose where each one
  is fragile — a deliberate "watch it break" teaching moment.

WHERE YOU SEE THIS:
  Feeds the MLAlgorithmLab pages in the UI:
    - AlgorithmComparisonMatrix : the grid comparing algorithms head-to-head
    - AlgorithmDetailPanel      : the drill-in view for one algorithm (incl. the
                                  GCP resource links this script makes resolvable)
    - HonestMetricsPanel        : the "no cherry-picking" metrics view, including
                                  how models hold up under Reality Mode curveballs

INPUTS -> OUTPUT:
  Input: the lab's generated datasets + model evaluation results (and GCP env config
  for where to write). Output: BigQuery tables (observations / predictions / eval)
  and GCS model-card exports. Prints a JSON summary of what it did.

HOW TO READ THE OUTPUT:
  The printed JSON's "status" tells you the result: "skipped" (with a reason) means
  the GCP config wasn't present, so it wrote nothing and exits cleanly (fail-soft) —
  this is normal in environments without cloud credentials, not an error.

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

    # Do the actual write (or, with --dry-run, just describe the plan and touch
    # nothing). The returned dict is echoed as JSON so a human or CI can see exactly
    # which tables/files were written or why it was skipped.
    result = materialize(dry_run=args.dry_run)
    print(json.dumps(result, indent=2))
    # "skipped" is the fail-soft path: config missing -> nothing written, exit 0.
    if result.get("status") == "skipped":
        print(f"\n[skipped] {result.get('reason')}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
