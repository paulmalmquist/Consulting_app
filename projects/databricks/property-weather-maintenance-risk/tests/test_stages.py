"""Stage-module tests — confirm each stage imports and runs independently.

These exercise the local (pure-Python) path only; the Spark `run_spark`
functions are covered by the Databricks job, not by unit tests. They also lock
the Track E leakage guard and the config loader.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from weather_risk.config import DEFAULT_CONFIG, load_config
from weather_risk.runner import LOCAL_STAGE_SEQUENCE, run_pipeline, run_stage
from weather_risk.stages import clean, features, ingest, property_ops, score, setup, train


def test_stages_import_and_run_independently() -> None:
    config = DEFAULT_CONFIG
    ctx = setup.run(config)
    assert ctx["run_id"].startswith("local-")

    sources = ingest.run(config, ctx["run_id"])
    assert any(row["source_name"] == "synthetic_property_ops" for row in sources)

    dataset = property_ops.run(config)
    dataset = clean.run(config, dataset)
    assert len(dataset["properties"]) == config.synthetic_property_count

    feature_rows = features.run(config, dataset, ctx["run_id"])
    assert feature_rows and feature_rows[0]["run_id"] == ctx["run_id"]

    metrics = train.run(config, feature_rows, ctx["run_id"])
    assert metrics[0]["is_best"] is True

    predictions = score.run(config, feature_rows, ctx["run_id"])
    assert len(predictions) == len(feature_rows)


def test_run_stage_cli_helper_supports_every_stage(tmp_path: Path) -> None:
    for stage in LOCAL_STAGE_SEQUENCE:
        result = run_stage(stage, DEFAULT_CONFIG, tmp_path / stage)
        assert result is not None


def test_leakage_guard_rejects_label_as_feature() -> None:
    with pytest.raises(RuntimeError, match="leakage"):
        train.assert_no_leakage(["weather_sensitivity", "work_order_surge_14d_flag"])


def test_leakage_guard_passes_clean_feature_set() -> None:
    # Should not raise.
    train.assert_no_leakage(features.MODEL_FEATURE_COLUMNS)


def test_load_config_from_json_file(tmp_path: Path) -> None:
    cfg_path = tmp_path / "cfg.json"
    cfg_path.write_text(json.dumps({"random_seed": 99, "synthetic_property_count": 10}), encoding="utf-8")
    config = load_config(config_path=cfg_path)
    assert config.random_seed == 99
    assert config.synthetic_property_count == 10
    # Unspecified fields keep defaults.
    assert config.catalog == DEFAULT_CONFIG.catalog


def test_load_config_env_overrides_file(tmp_path: Path) -> None:
    cfg_path = tmp_path / "cfg.json"
    cfg_path.write_text(json.dumps({"random_seed": 1}), encoding="utf-8")
    config = load_config(config_path=cfg_path, env={"WEATHER_RISK_RANDOM_SEED": "7"})
    assert config.random_seed == 7


def test_run_pipeline_writes_full_contract(tmp_path: Path) -> None:
    result = run_pipeline(DEFAULT_CONFIG, out_dir=tmp_path)
    assert result["ok"] is True
    assert (tmp_path / "artifact_manifest.json").exists()
    manifest = json.loads((tmp_path / "artifact_manifest.json").read_text(encoding="utf-8"))
    # Track E: every chart manifest entry carries source table + row count.
    assert all("source_table" in entry and "row_count_used" in entry for entry in manifest)
