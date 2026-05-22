from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Export a machine-readable run receipt placeholder.")
    parser.add_argument("--run-id", default="latest")
    parser.add_argument("--out", type=Path, default=Path("artifacts/happyco/weather-risk/databricks_run_attempt_receipt.json"))
    parser.add_argument("--status", default="not_run")
    args = parser.parse_args()

    payload = {
        "demo_mode": True,
        "data_source": "public_weather_and_synthetic_property_ops",
        "databricks_executed": args.status == "success",
        "run_id": args.run_id,
        "status": args.status,
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "caveat": "Synthetic property operations data. Not HappyCo production data.",
        "claim_allowed": "Databricks ML training run executed on public weather and synthetic property operations data only when status is success.",
        "claim_not_allowed": "Production HappyCo model trained/deployed.",
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print({"ok": True, "receipt": str(args.out)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
