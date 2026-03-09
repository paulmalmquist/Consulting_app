from __future__ import annotations

import argparse
import json
from datetime import date
from uuid import UUID

from app.services import opportunity_engine


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Opportunity Engine batch.")
    parser.add_argument("--env-id", required=True, help="Environment UUID")
    parser.add_argument("--business-id", required=True, help="Business UUID")
    parser.add_argument("--mode", choices=["fixture", "live"], default="fixture")
    parser.add_argument("--run-type", default="scheduled")
    parser.add_argument(
        "--business-lines",
        default="consulting,pds,re_investment,market_intel",
        help="Comma-separated business lines",
    )
    parser.add_argument("--triggered-by", default="cli")
    parser.add_argument("--as-of-date", default=None, help="ISO date override")
    args = parser.parse_args()

    result = opportunity_engine.create_run(
        env_id=UUID(args.env_id),
        business_id=UUID(args.business_id),
        mode=args.mode,
        run_type=args.run_type,
        business_lines=[value.strip() for value in args.business_lines.split(",") if value.strip()],
        triggered_by=args.triggered_by,
        as_of_date=date.fromisoformat(args.as_of_date) if args.as_of_date else None,
    )
    print(json.dumps(result, default=str, indent=2))


if __name__ == "__main__":
    main()
