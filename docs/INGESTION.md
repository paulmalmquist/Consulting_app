# Ingestion Module

## Overview
The ingestion module handles manual CSV/XLSX uploads and converts loose files into normalized tables for metrics and reporting.

Core guarantees:
- Deterministic pipelines: same source version + same recipe + same engine version => same run hash.
- Full lineage: source file -> parser config -> mapping -> transforms -> output rows.
- Auditable run history: every run captures row counts, errors, and lineage JSON.

## Supported Formats
- `CSV` (`.csv`)
  - Delimiter detection with deterministic fallback.
  - Header row detection, column type inference, key candidate detection.
- `XLSX` (`.xlsx`)
  - Sheet detection.
  - Header row detection and inferred schema per sheet.

Messy-file handling (v1):
- Multi-sheet selection.
- Header row inference.
- Totals-row skipping when the first cell indicates total/subtotal.
- Mixed type detection with per-row validation errors (no hard crash).

## Recipe Structure
`ingest_recipe` stores the deterministic pipeline definition.

```json
{
  "target_table_key": "vendor",
  "mode": "upsert",
  "primary_key_fields": ["name"],
  "settings_json": {
    "sheet_name": "Vendors",
    "header_row_index": 1
  },
  "mappings": [
    {
      "source_column": "Vendor Name",
      "target_column": "name",
      "required": true,
      "mapping_order": 0,
      "transform_json": {
        "trim": true,
        "regex_extract": { "pattern": "^(.*)$", "group": 1 }
      }
    }
  ],
  "transform_steps": [
    {
      "step_order": 1,
      "step_type": "filter",
      "config_json": {
        "conditions": [{ "column": "name", "op": "ne", "value": "" }]
      }
    }
  ]
}
```

## Validation
Generic v1 checks:
- Required fields.
- Type-cast errors captured at row/column level.
- Duplicate key detection in-batch.

Target-specific v1 checks:
- `vendor`: `name` required, EIN-like `tax_id`, allowed `payment_terms`.
- `trial_balance`: `account`, `period`, numeric `ending_balance`.
- `gl_transaction`: `txn_date`, `account`, numeric `amount`.
- `cashflow_event`: `event_date`, numeric `amount`, enum `event_type`.

## Output Targets
Canonical targets (Option 2):
- `vendor`
- `customer`
- `cashflow_event`
- `trial_balance`
- `gl_transaction`
- `deal_pipeline_deal`

Fallback for non-canonical targets:
- `ingested_table`
- `ingested_row` JSON row store.

## Metrics Integration
After successful canonical runs, registry rows are upserted in `app.metrics_data_point_registry`.

Examples:
- `vendor.count`
- `ap.bills.total`
- `cashflow_event.sum_by_month`
- `trial_balance.ending_balance_by_account`
- `gl_transaction.sum_by_account_by_month`

## Adding a New Stock Target
1. Add schema metadata in `backend/app/ingest/engine.py` (`TARGET_SCHEMAS`).
2. Add canonical table mapping in `backend/app/services/ingest.py` (`CANONICAL_TARGETS`).
3. Add/extend migration DDL in `repo-b/db/migrations/006_ingestion_pipeline.sql`.
4. Add target-specific validation rules in `backend/app/ingest/engine.py` (`_validate_target_specific`).
5. Add frontend target handling in the ingest wizard (`repo-b/src/components/ingest/IngestSourceWizard.tsx`).
6. Add tests for profile/validation/upsert behavior in `backend/tests/test_ingest_engine.py`.
