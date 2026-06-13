#!/usr/bin/env python3
"""RS Factory ML pipeline orchestrator — one warehouse start/stop per run.

    python run_pipeline.py                  # load -> silver -> gold -> train -> export
    python run_pipeline.py --from silver    # resume after a completed bronze load
    python run_pipeline.py --until gold     # stop before training (no serverless cost)

Stages: load, silver, gold, train, export. The warehouse stops on exit even on
failure (cost control); the serverless training job manages its own compute.
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
    todo = STAGES[STAGES.index(args.start): STAGES.index(args.until) + 1]
    print(f"stages: {' -> '.join(todo)}")

    client = RsFactoryClient()
    client.start_warehouse()
    client.wait_for_warehouse()
    try:
        if "load" in todo:
            run_script("load_to_databricks.py")
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
        if "export" in todo:
            run_script("export_dashboard_json.py")
        return 0
    finally:
        try:
            client.stop_warehouse()
            print("warehouse stopped")
        except Exception as exc:
            print(f"warehouse stop failed (stop it manually): {exc}")


if __name__ == "__main__":
    sys.exit(main())
