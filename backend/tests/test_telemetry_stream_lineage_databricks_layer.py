"""Lineage Databricks-layer contract + SELECT-projection regression guard.

These are pure-function tests (no DB). They lock two things:

1. _databricks_layer fails closed unless a row explicitly carries
   databricks_lineage_status == 'available', and surfaces the real pointer
   fields when it does.
2. Every pointer column _databricks_layer reads on an available row is actually
   present in the _ROW_COLS / _TRIAGE_COLS SELECT lists. This guards the bug
   where the layer read columns the query never fetched, so the drawer rendered
   null catalog/table/version even after a row flipped to 'available'.
"""

from app.services import telemetry_stream_lineage as lin


def test_databricks_layer_fails_closed_when_row_absent():
    out = lin._databricks_layer(None)
    assert out["status"] == "not_available"
    assert out["null_reason"] == lin.DATABRICKS_TABLE_MAPPING_NOT_CONFIGURED
    assert out["catalog"] is None
    assert out["table"] is None
    assert out["delta_version"] is None


def test_databricks_layer_fails_closed_with_explicit_status_and_reason():
    out = lin._databricks_layer(
        {"databricks_lineage_status": "not_available", "databricks_null_reason": "custom_reason"}
    )
    assert out["status"] == "not_available"
    assert out["null_reason"] == "custom_reason"


def test_databricks_layer_surfaces_pointer_when_available():
    row = {
        "databricks_lineage_status": "available",
        "databricks_catalog": "novendor_1",
        "databricks_schema": "telemetry",
        "databricks_table": "bronze_stargate_printer",
        "databricks_path": "s3a://novendor-telemetry/bronze_stargate_printer",
        "delta_version": 7,
        "delta_commit_timestamp": "2026-06-25T00:00:00Z",
    }
    out = lin._databricks_layer(row)
    assert out["status"] == "available"
    assert out["catalog"] == "novendor_1"
    assert out["schema"] == "telemetry"
    assert out["table"] == "bronze_stargate_printer"
    assert out["path"] == "s3a://novendor-telemetry/bronze_stargate_printer"
    assert out["delta_version"] == 7
    assert out["delta_commit_timestamp"] == "2026-06-25T00:00:00Z"
    assert out["null_reason"] is None


def test_row_cols_select_every_column_the_layer_reads():
    # If _databricks_layer reads a column that _ROW_COLS does not SELECT, the
    # drawer renders null even after the status flips. Lock the projection.
    for col in (
        "databricks_catalog",
        "databricks_schema",
        "databricks_table",
        "databricks_path",
        "delta_version",
        "delta_commit_timestamp",
        "databricks_lineage_status",
        "databricks_null_reason",
    ):
        assert col in lin._ROW_COLS, f"_ROW_COLS is missing {col}"


def test_triage_cols_select_the_pointer_columns_the_layer_reads():
    # tel_stream_triage_events carries the 6-column pointer subset (no path /
    # delta_commit_timestamp on that table).
    for col in (
        "databricks_catalog",
        "databricks_schema",
        "databricks_table",
        "delta_version",
        "databricks_lineage_status",
        "databricks_null_reason",
    ):
        assert col in lin._TRIAGE_COLS, f"_TRIAGE_COLS is missing {col}"
