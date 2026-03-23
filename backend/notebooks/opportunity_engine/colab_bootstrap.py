from __future__ import annotations

import json
import os
from datetime import date
from uuid import UUID

from app.services import opportunity_engine


def bootstrap_run(
    *,
    env_id: str,
    business_id: str,
    mode: str = "fixture",
    as_of_date: str | None = None,
) -> dict:
    return opportunity_engine.create_run(
        env_id=UUID(env_id),
        business_id=UUID(business_id),
        mode=mode,
        run_type="colab",
        business_lines=["consulting", "pds", "re_investment", "market_intel"],
        triggered_by="colab_bootstrap",
        as_of_date=date.fromisoformat(as_of_date) if as_of_date else None,
    )


if __name__ == "__main__":
    env_id = os.environ.get("OPPORTUNITY_ENGINE_ENV_ID", "")
    business_id = os.environ.get("OPPORTUNITY_ENGINE_BUSINESS_ID", "")
    result = bootstrap_run(
        env_id=env_id,
        business_id=business_id,
        mode=os.environ.get("OPPORTUNITY_ENGINE_MODE", "fixture"),
        as_of_date=os.environ.get("OPPORTUNITY_ENGINE_AS_OF_DATE"),
    )
    print(json.dumps(result, default=str, indent=2))
