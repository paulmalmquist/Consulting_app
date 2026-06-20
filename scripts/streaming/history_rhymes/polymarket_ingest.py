"""Run the History Rhymes Polymarket public-feed ingestion worker."""

from __future__ import annotations

import asyncio
import logging

from app.services.hr_polymarket.config import PolymarketSettings
from app.services.hr_polymarket.worker import PolymarketIngestionWorker


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = PolymarketSettings.from_env()
    asyncio.run(PolymarketIngestionWorker(settings).run_forever())


if __name__ == "__main__":
    main()
