"""CLI entrypoint: `python -m weather_risk`.

Runs the pure-Python local-contract pipeline (no Databricks/Spark needed). The
per-stage Spark runner is for the Databricks notebook adapters, not this CLI.

Examples:
    python -m weather_risk                          # full local run
    python -m weather_risk --stage features         # run one stage in isolation
    python -m weather_risk --config path/to/cfg.json
    python -m weather_risk --out ./local_outputs
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import load_config
from .runner import LOCAL_STAGE_SEQUENCE, run_pipeline, run_stage

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = PROJECT_ROOT / "local_outputs"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="weather_risk",
        description=(
            "Property weather maintenance risk pipeline (local contract path). "
            "Public NOAA/FEMA weather/hazard concepts and synthetic property "
            "operations data — not HappyCo production data."
        ),
    )
    parser.add_argument(
        "--stage",
        choices=list(LOCAL_STAGE_SEQUENCE),
        default=None,
        help="Run a single stage in isolation instead of the full pipeline.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Path to a JSON config file (overrides defaults; env vars override the file).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="Output directory for the local-contract artifacts.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = load_config(config_path=args.config)

    if args.stage is not None:
        result = run_stage(args.stage, config, args.out)
        print(json.dumps({"stage": args.stage, "result": _jsonable(result)}, default=str))
        return 0

    result = run_pipeline(config, out_dir=args.out)
    print(json.dumps(result, default=str))
    return 0


def _jsonable(value: object) -> object:
    """Best-effort conversion so stage results print cleanly as JSON."""
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


if __name__ == "__main__":
    sys.exit(main())
