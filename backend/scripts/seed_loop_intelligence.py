"""Seed Loop Intelligence defaults for a consulting environment.

Usage:
  python -m scripts.seed_loop_intelligence --env-id <uuid>
  python -m scripts.seed_loop_intelligence --env-id <uuid> --business-id <uuid>
"""
from __future__ import annotations

import argparse
import json
from uuid import UUID

from app.db import get_cursor
from app.services import cro_loops


def _resolve_business_id(env_id: str) -> UUID:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT business_id
            FROM app.environments
            WHERE env_id = %s::uuid
            """,
            (env_id,),
        )
        row = cur.fetchone()
    if not row or not row.get("business_id"):
        raise SystemExit(f"Environment {env_id} is not bound to a business.")
    return UUID(str(row["business_id"]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-id", required=True)
    parser.add_argument("--business-id", default="")
    args = parser.parse_args()

    business_id = UUID(args.business_id) if args.business_id else _resolve_business_id(args.env_id)
    seeded = cro_loops.seed_default_loops(env_id=args.env_id, business_id=business_id)
    print(json.dumps({"status": "seeded", "loops_seeded": seeded}, indent=2))


if __name__ == "__main__":
    main()
