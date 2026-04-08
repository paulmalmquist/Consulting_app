#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


DEFAULT_BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001"
DEFAULT_ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"
REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Meridian metric inventory snapshot.")
    parser.add_argument("--business-id", default=DEFAULT_BUSINESS_ID)
    parser.add_argument("--env-id", default=DEFAULT_ENV_ID)
    parser.add_argument("--output-dir", default="docs/metric_inventory")
    args = parser.parse_args()

    from app.services.metric_inventory import (
        build_metric_inventory_response,
        render_metric_inventory_markdown,
    )

    response = build_metric_inventory_response(
        business_id=args.business_id,
        env_id=args.env_id,
        scope="all",
    )

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = output_dir / "meridian.json"
    markdown_path = output_dir / "meridian.md"

    json_path.write_text(json.dumps(response, indent=2, sort_keys=True, default=str) + "\n")
    markdown_path.write_text(render_metric_inventory_markdown(response))

    print(f"Wrote {json_path}")
    print(f"Wrote {markdown_path}")
    print(f"Inventory hash: {response['inventory_hash']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
