"""Telemetry ML — PRODUCTION pipeline package (source of truth).

Two-tier model:
- `databricks/notebooks/*.py` are the EXPERIMENTAL tier — self-contained, uploaded and run as
  serverless jobs, where model logic is iterated. They may carry their own inline copies and are
  allowed to diverge; they are the sandbox.
- THIS package is the PRODUCTION tier — the governed, importable, locally-unit-testable source of
  truth for metric definitions and the promotion gate contract. When an experiment proves out, its
  logic graduates into here, and the production promotion path imports from here (not from a notebook).

Pure-Python, no Spark/Databricks imports — so it runs and tests in CI without a cluster.
"""
from . import metrics, gates, promote  # noqa: F401

__all__ = ["metrics", "gates", "promote"]
