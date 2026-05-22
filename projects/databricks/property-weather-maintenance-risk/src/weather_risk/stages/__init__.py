"""Pipeline stages — one module per notebook.

Each stage module owns the business logic for exactly one notebook
(`notebooks/0X_*.py`). The notebooks are thin adapters that import the matching
stage and call its `run()` / `run_spark()` function.

Stage order (also the notebook order):
    setup -> ingest -> property_ops -> clean -> features -> train -> score -> validate

Local path: `features`, `train`, `score`, `validate` carry the pure-Python
contract logic used by `runner.run_pipeline` and `pipeline.generate_local_outputs`.
Spark path: every stage exposes a `run_spark(ctx)` used by the Databricks
notebook adapters.
"""

STAGE_ORDER = (
    "setup",
    "ingest",
    "property_ops",
    "clean",
    "features",
    "train",
    "score",
    "validate",
)

__all__ = ["STAGE_ORDER"]
