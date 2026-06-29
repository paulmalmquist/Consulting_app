#!/usr/bin/env python3
"""RS Factory ML pipeline orchestrator — one warehouse start/stop per run.

    python run_pipeline.py                  # load -> silver -> gold -> train -> export
    python run_pipeline.py --from silver    # resume after a completed bronze load
    python run_pipeline.py --until gold     # stop before training (no serverless cost)

Stages: load, silver, gold, train, export. The warehouse stops on exit even on
failure (cost control); the serverless training job manages its own compute.

===== TEACHING NOTES (plain language) =====

WHAT THIS FILE DOES: this is the conductor. The real work lives in the other
files; this script just runs them in the right order and manages the cloud
warehouse (turn it on, do the work, turn it off — because compute costs money).
Think of it as the "Run All" button for the whole Factory ML pipeline.

THE PIPELINE, end to end:
    load   -> copy the raw factory data up to Databricks (bronze).
    silver -> 02_silver_features.py: engineer the shape features.
    gold   -> 03_gold_feature_store.py: join features to outcomes, define targets.
    train  -> 04_train_print_quality.py: train + score the 3 models, compute SHAP.
    export -> export_dashboard_json.py: write the /labs/factory-ml/*.json receipts
              that the Factory ML console (FeatureImportancePanel, RegistryPanel,
              NcrPanel, ReadinessGauge, LayerHeatmap) reads.

HOW TO READ THE FLAGS:
    --from <stage>  start partway through (skip stages already done). Default: load.
    --until <stage> stop early. Common use: `--until gold` builds the data without
                    paying for the (more expensive) serverless training run.

COST CONTROL: the warehouse is started once at the top and the `finally` block
guarantees it stops even if a stage crashes — so a failure never leaves expensive
compute running.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE / "scripts"))

from databricks_client import RsFactoryClient  # noqa: E402

STAGES = ["load", "silver", "gold", "train", "export"]


# Run a local helper script (load/export) as a child process and fail loudly if
# it errors. The notebooks (silver/gold/train) run remotely instead — see main().
def run_script(name: str) -> None:
    result = subprocess.run([sys.executable, str(_HERE / "scripts" / name)],
                            cwd=str(_HERE / "scripts"))
    if result.returncode != 0:
        raise RuntimeError(f"{name} exited {result.returncode}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="start", choices=STAGES, default="load")
    parser.add_argument("--until", dest="until", choices=STAGES, default="export")
    args = parser.parse_args()
    # `todo` is the contiguous slice of stages to run, from --from through --until.
    todo = STAGES[STAGES.index(args.start): STAGES.index(args.until) + 1]
    print(f"stages: {' -> '.join(todo)}")

    # Spin the warehouse up once for the whole run, and (see the finally block)
    # always stop it afterward so we never leak cloud compute cost.
    client = RsFactoryClient()
    client.start_warehouse()
    client.wait_for_warehouse()
    try:
        # Stage 1: load raw data up to Databricks (a local helper script).
        if "load" in todo:
            run_script("load_to_databricks.py")
        # Stages 2-4: push each notebook to Databricks and run it as a serverless
        # job (training gets a longer timeout because it's the heaviest step).
        for stage, notebook in (("silver", "02_silver_features.py"),
                                ("gold", "03_gold_feature_store.py"),
                                ("train", "04_train_print_quality.py")):
            if stage not in todo:
                continue
            print(f"== {stage}: {notebook} (serverless job)")
            path = client.import_notebook_source(_HERE / "notebooks" / notebook,
                                                 notebook.replace(".py", ""))
            run = client.run_notebook_job(path, f"rs_factory_ml_{stage}",
                                          timeout_s=5400 if stage == "train" else 3600)
            print(f"   {stage} done: {run.get('run_page_url', '')}")
        # Stage 5: turn the gold tables + model outputs into the JSON receipts the
        # Factory ML console panels read from /labs/factory-ml/.
        if "export" in todo:
            run_script("export_dashboard_json.py")
        return 0
    finally:
        # Always stop the warehouse — even on crash — so cost never runs away.
        try:
            client.stop_warehouse()
            print("warehouse stopped")
        except Exception as exc:
            print(f"warehouse stop failed (stop it manually): {exc}")


if __name__ == "__main__":
    sys.exit(main())
