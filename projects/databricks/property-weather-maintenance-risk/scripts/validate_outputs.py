from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC = PROJECT_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from weather_risk.contracts import REQUIRED_CHARTS, REQUIRED_OUTPUTS
from weather_risk.pipeline import generate_local_outputs, validate_local_contract


def _validate_output_dir(out_dir: Path) -> None:
    missing = [name for name in REQUIRED_OUTPUTS if not (out_dir / name).exists()]
    missing_charts = [name for name in REQUIRED_CHARTS if not (out_dir / "charts" / name).exists()]
    empty_charts = [
        name
        for name in REQUIRED_CHARTS
        if (out_dir / "charts" / name).exists() and (out_dir / "charts" / name).stat().st_size == 0
    ]
    if missing or missing_charts or empty_charts:
        raise SystemExit(
            {
                "ok": False,
                "missing_outputs": missing,
                "missing_charts": missing_charts,
                "empty_charts": empty_charts,
            }
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate property weather maintenance risk outputs.")
    parser.add_argument("--mode", choices=["local-contract", "generate-local", "validate-output-dir"], required=True)
    parser.add_argument("--out", type=Path, default=PROJECT_ROOT / "local_outputs")
    args = parser.parse_args()

    if args.mode == "local-contract":
        print(validate_local_contract())
        return 0
    if args.mode == "generate-local":
        print(generate_local_outputs(args.out))
        _validate_output_dir(args.out)
        return 0
    _validate_output_dir(args.out)
    print({"ok": True, "out": str(args.out)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
