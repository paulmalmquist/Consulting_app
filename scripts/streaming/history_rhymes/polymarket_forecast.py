"""Run the History Rhymes Polymarket divergence forecast worker."""

from __future__ import annotations

import logging

from app.services.hr_polymarket.config import PolymarketSettings
from app.services.hr_polymarket.forecast_worker import PolymarketForecastWorker


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    PolymarketForecastWorker(PolymarketSettings.from_env()).run_forever()


if __name__ == "__main__":
    main()
