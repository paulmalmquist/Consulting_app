"""ML Algorithm Decision Lab service package (History Rhymes).

Deterministic, fail-closed, in-memory training of 10 classic ML algorithms on
synthetic HR-flavored market-signal data — a teaching/demo surface, not a
production predictor. No DB, no LLM, no live market data.
"""

from __future__ import annotations

from .dataset import generate_dataset, get_dataset_profile
from .registry import ALGORITHM_DEMOS, get_demo
from .runner import (
    build_compare,
    build_overview,
    run_algorithm,
    run_all_algorithms,
)
from .schema import MODEL_VERSION, SEED, SOURCE

__all__ = [
    "ALGORITHM_DEMOS",
    "MODEL_VERSION",
    "SEED",
    "SOURCE",
    "build_compare",
    "build_overview",
    "generate_dataset",
    "get_dataset_profile",
    "get_demo",
    "run_algorithm",
    "run_all_algorithms",
]
