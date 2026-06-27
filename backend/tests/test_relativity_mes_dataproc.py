"""Tests for the Dataproc medallion build (Ticket 5).

These cover the pieces that are pure-Python and unit-testable without Spark or BigQuery:
  - the ugly-bronze mess injection is deterministic and preserves the demo invariants
  - the controlled vocabularies in the silver job cover every value the uglifier can emit
  - the serving-sync provenance constant is correct

The Spark transforms themselves are validated end-to-end by audit_medallion.py against the live BQ
dataset (run after each Dataproc batch); these tests guard the deterministic Python contracts so a
regression in mess-injection or vocab coverage fails fast in CI without needing the cloud.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DP_DIR = REPO_ROOT / "telemetry-platform" / "dataproc" / "relativity_mes"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.relativity_mes_seed.generate import SUSPECT_LOT, build_dataset  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ugly_mod = _load("load_ugly_bronze", DP_DIR / "load_ugly_bronze.py")


def test_uglify_is_deterministic():
    ds = build_dataset()
    a, ma = ugly_mod.uglify(ds)
    b, mb = ugly_mod.uglify(ds)
    assert ma == mb
    # same row counts per table across two runs
    assert {k: len(v) for k, v in a.items()} == {k: len(v) for k, v in b.items()}


def test_uglify_injects_real_mess():
    ds = build_dataset()
    _, m = ugly_mod.uglify(ds)
    assert m["dup_op_exec"] >= 1
    assert m["dup_genealogy"] >= 1
    assert m["null_keys"] >= 1
    assert m["negative_minutes"] >= 1
    assert m["unmatched_xwalk"] == 1
    assert m["casing_synonyms"] > 50


def test_uglify_everything_is_string():
    ds = build_dataset()
    ugly, _ = ugly_mod.uglify(ds)
    for table, rows in ugly.items():
        for r in rows:
            for k, v in r.items():
                assert v is None or isinstance(v, str), f"{table}.{k} not str: {v!r}"


def test_invariants_survive_uglification():
    """The suspect-lot consumption rows and the open major NCR must NOT be corrupted by mess."""
    ds = build_dataset()
    ugly, _ = ugly_mod.uglify(ds)
    # suspect lot still present on its consumption rows (lot_no untouched on invariant rows)
    mc = ugly["rel_mes_material_consumption"]
    suspect_rows = [r for r in mc if r.get("lot_no") == SUSPECT_LOT]
    assert len(suspect_rows) >= 2, "suspect-lot consumption rows must survive uglification"
    # NCR-0001 still maps to an open/major-ish raw status (casing may vary, but not nulled)
    nc = ugly["rel_mes_nonconformance"]
    n1 = next(r for r in nc if r["ncr_id"] == "NCR-0001")
    assert n1["status"] is not None and n1["severity"] is not None


def test_negative_minutes_not_on_invariant_workorders():
    ds = build_dataset()
    ugly, _ = ugly_mod.uglify(ds)
    neg = [r for r in ugly["rel_mes_operation_execution"] if r.get("actual_minutes") == "-40"]
    assert len(neg) == 1
    assert neg[0]["work_order_no"] not in ("WO-001-TPS", "WO-002-STR")


def _load_no_pyspark(name, path):
    """Load a Dataproc job module locally by stubbing the pyspark/google imports it does at top.

    The job only *uses* pyspark inside main(); the module-level constants (VOCAB, PROVENANCE) are
    plain data, so stubbing the import lets CI validate them without a Spark install."""
    import types
    for mod_name in ("pyspark", "pyspark.sql", "pyspark.sql.types"):
        if mod_name not in sys.modules:
            sys.modules[mod_name] = types.ModuleType(mod_name)
    pys = sys.modules["pyspark.sql"]
    for attr in ("SparkSession", "functions", "Window"):
        if not hasattr(pys, attr):
            setattr(pys, attr, types.SimpleNamespace())
    if not hasattr(sys.modules["pyspark.sql.types"], "StringType"):
        sys.modules["pyspark.sql.types"].StringType = type("StringType", (), {})
    return _load(name, path)


def test_silver_vocab_covers_uglifier_outputs():
    """Every synonym/casing the uglifier can emit must be in the silver job's controlled vocab,
    otherwise a value would be wrongly quarantined as out-of-domain."""
    silver = _load_no_pyspark("rel_silver", DP_DIR / "jobs" / "rel_silver.py")
    vocab = silver.VOCAB

    def covered(pool_map, vocab_key):
        keys = set(vocab[vocab_key].keys())
        for canonical, variants in pool_map.items():
            for v in variants:
                assert v.strip().lower() in keys, f"{v!r} missing from {vocab_key}"

    covered(ugly_mod._STATUS_NCR, "ncr_status")
    covered(ugly_mod._SEVERITY, "severity")
    covered(ugly_mod._RESULT, "result")
    covered(ugly_mod._WO_STATUS, "wo_status")
    covered(ugly_mod._DISP, "disposition")


def test_serving_sync_provenance_constant():
    sync = _load("sync_serving_from_bq", DP_DIR / "sync_serving_from_bq.py")
    assert sync.PROVENANCE == "dataproc-gold"
