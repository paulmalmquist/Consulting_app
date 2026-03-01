from __future__ import annotations

from uuid import UUID

from app.services import re_sustainability


def run_projection(
    *,
    fund_id: UUID,
    scenario_id: UUID,
    base_quarter: str,
    horizon_years: int,
    projection_mode: str,
) -> dict:
    return re_sustainability.run_projection(
        fund_id=fund_id,
        scenario_id=scenario_id,
        base_quarter=base_quarter,
        horizon_years=horizon_years,
        projection_mode=projection_mode,
    )


def get_projection(*, projection_run_id: UUID) -> dict:
    return re_sustainability.get_projection(projection_run_id=projection_run_id)
