"""Run the History Rhymes Polymarket feature materializer."""

from __future__ import annotations

import logging

from app.services.hr_polymarket.config import PolymarketSettings
from app.services.hr_polymarket.materializer_worker import (
    PolymarketMaterializerWorker,
)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    PolymarketMaterializerWorker(PolymarketSettings.from_env()).run_forever()


if __name__ == "__main__":
    main()
