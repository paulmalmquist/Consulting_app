"""RS Factory digital-thread seed generator.

Deterministic, fixed-seed synthetic data for an aerospace-manufacturing demo
(Relativity Space analog). SYNTHETIC ONLY — no real company, supplier, or personal
data. Outputs CSV / SQLite / Parquet / JSONL artifacts; a curated+gold subset is
later loaded into Postgres inside the existing telemetry environment (prefix `rsf_`).
"""

MASTER_SEED = 20260610

__all__ = ["MASTER_SEED"]
