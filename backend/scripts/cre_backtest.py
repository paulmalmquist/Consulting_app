from __future__ import annotations

import sys
from uuid import UUID

from app.db import get_cursor
from app.services import re_intelligence


def main() -> None:
    property_id = UUID(sys.argv[1])
    forecasts = re_intelligence.materialize_forecasts(
        scope="property",
        entity_ids=[property_id],
        targets=["rent_growth_next_12m", "value_change_proxy_next_12m", "refi_risk_score"],
        horizon="12m",
        feature_version="miami_mvp_v1",
    )
    with get_cursor() as cur:
        for row in forecasts:
            cur.execute(
                """
                INSERT INTO forecast_backtest_result (
                  env_id, business_id, scope, entity_id, target, model_version,
                  metric_key, metric_value, sample_size, window_label
                )
                VALUES (%s, %s, %s, %s, %s, %s, 'mae', %s, 1, 'seed_backtest')
                """,
                (
                    str(row["env_id"]),
                    str(row["business_id"]),
                    row["scope"],
                    str(row["entity_id"]),
                    row["target"],
                    row["model_version"],
                    abs(float(row["prediction"]) - float(row.get("baseline_prediction") or 0)),
                ),
            )


if __name__ == "__main__":
    main()

