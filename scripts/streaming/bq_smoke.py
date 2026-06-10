"""Phase 3A smoke: prove a real BigQuery raw event write.

Builds one execution.completed EventEnvelope, runs it through the sink's
process_message() path with BQ_ENABLED=true, and queries the receipt back.
Prints the acceptance receipt row so the result is verifiable without a UI.

No Kafka broker required -- the envelope is handed directly to the sink, not
consumed from a topic. This proves the BQ write path independently.

Usage (credentials required):
  export BQ_ENABLED=true
  export BQ_PROJECT_ID=your-gcp-project
  export BQ_DATASET=winston_events_raw   # default
  export BQ_TABLE=events                  # default
  # Credential options (pick one):
  #   a) Application Default Credentials: run `gcloud auth application-default login`
  #   b) Service account key: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json

  python scripts/streaming/bq_smoke.py

Without credentials (or BQ_ENABLED=false):
  python scripts/streaming/bq_smoke.py
  # prints "BQ_ENABLED=false -- no write performed (no-op path)"

Batch mode (free-tier compatible -- no billing required for load jobs):
  python scripts/streaming/bq_smoke.py --batch
  # Uses load_table_from_json instead of insert_rows_json.
  # Proves auth, table access, write, and query-back without streaming billing.
  # Production sink still uses streaming inserts.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from uuid import uuid4

# Make backend/app importable when run from repo root.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from app.events.envelope import EventEnvelope
from app.events.sink import (
    BQ_DATASET,
    BQ_ENABLED,
    BQ_PROJECT_ID,
    BQ_TABLE,
    envelope_to_bq_row,
    process_message,
    validate_envelope,
)


def _separator() -> None:
    print("-" * 60)


def _write_batch(row: dict, *, project: str, dataset: str, table: str) -> None:
    """Load-job write -- free-tier compatible, committed atomically."""
    try:
        from google.cloud import bigquery  # noqa: PLC0415
    except ImportError as exc:
        raise RuntimeError("google-cloud-bigquery not installed") from exc

    client = bigquery.Client(project=project)
    table_ref = f"{project}.{dataset}.{table}"

    # Timestamps must be ISO strings for load_table_from_json.
    serialisable = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            serialisable[k] = v.isoformat()
        else:
            serialisable[k] = v

    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
    )
    job = client.load_table_from_json([serialisable], table_ref, job_config=job_config)
    job.result()  # wait for completion

    if job.errors:
        raise RuntimeError(f"Load job errors: {job.errors}")


def main(batch_mode: bool = False) -> int:
    print("Winston Event Streaming -- Phase 3A BigQuery smoke")
    _separator()

    mode_label = "batch (load job)" if batch_mode else "streaming (insert_rows_json)"
    print(f"BQ_ENABLED    = {BQ_ENABLED}")
    print(f"BQ_PROJECT_ID = {BQ_PROJECT_ID or '(unset)'}")
    print(f"BQ_DATASET    = {BQ_DATASET}")
    print(f"BQ_TABLE      = {BQ_TABLE}")
    print(f"Write mode    = {mode_label}")

    if not BQ_ENABLED:
        print("\nBQ_ENABLED=false -- no write performed (no-op path).")
        print("Set BQ_ENABLED=true + BQ_PROJECT_ID to run a real write.")
        _separator()
        return 0

    if not BQ_PROJECT_ID:
        print("\nERROR: BQ_PROJECT_ID is not set. Export it and retry.")
        return 1

    # Build a synthetic execution.completed envelope.
    run_id = str(uuid4())
    business_id = uuid4()
    envelope = EventEnvelope(
        event_type="execution.completed",
        idempotency_key=f"execution.completed:{run_id}",
        occurred_at=datetime.now(timezone.utc),
        run_id=run_id,
        business_id=business_id,
        source_service="backend",
        payload={"status": "completed", "execution_type": "smoke_test"},
    )

    print("\nEnvelope built:")
    print(f"  event_id        = {envelope.event_id}")
    print(f"  event_type      = {envelope.event_type}")
    print(f"  idempotency_key = {envelope.idempotency_key}")
    print(f"  run_id          = {run_id}")
    print(f"  business_id     = {business_id}")
    _separator()

    raw_bytes = envelope.to_wire()
    print(f"Wire bytes ({len(raw_bytes)} bytes):")
    print(f"  {raw_bytes.decode()}")
    _separator()

    if batch_mode:
        # Batch path: validate + map via sink helpers, write via load job.
        print("Running validate -> map -> load_table_from_json (batch mode) ...")
        try:
            validated = validate_envelope(raw_bytes)
            row = envelope_to_bq_row(validated)
            _write_batch(
                row,
                project=BQ_PROJECT_ID,
                dataset=BQ_DATASET,
                table=BQ_TABLE,
            )
            result = {"status": "ok", "event_type": envelope.event_type,
                      "event_id": str(envelope.event_id), "mode": "batch"}
        except Exception as exc:
            print(f"Batch write failed: {exc}")
            return 1
    else:
        # Streaming path: full process_message() (production code path).
        print("Running process_message() -> validate -> map -> write_row_to_bq ...")
        result = process_message(raw_bytes)

    print(f"Result: {json.dumps(result, indent=2)}")
    _separator()

    if result["status"] != "ok":
        print(f"FAILED: process_message returned status={result['status']}")
        print(f"Reason: {result.get('reason', '(none)')}")
        if not batch_mode:
            print("\nHint: streaming inserts require a full GCP billing account.")
            print("Run with --batch to use a free-tier-compatible load job instead.")
        return 1

    # Query back the row to produce the acceptance receipt.
    print("Querying BigQuery for acceptance receipt ...")
    table_fqn = f"`{BQ_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}`"
    query = (
        f"SELECT event_id, idempotency_key, event_type, run_id,\n"
        f"       occurred_at, published_at, ingested_at,\n"
        f"       source, dead_letter, dead_letter_reason\n"
        f"  FROM {table_fqn}\n"
        f" WHERE run_id = '{run_id}'\n"
        f" ORDER BY ingested_at DESC\n"
        f" LIMIT 5"
    )
    print(f"\nAcceptance query:\n{query}\n")

    try:
        from google.cloud import bigquery  # noqa: PLC0415
        client = bigquery.Client(project=BQ_PROJECT_ID)
        rows = list(client.query(query).result())
    except ImportError:
        print("google-cloud-bigquery not installed -- cannot query back.")
        print("Install with: pip install google-cloud-bigquery>=3.11")
        return 1
    except Exception as exc:
        print(f"BQ query failed: {exc}")
        return 1

    if not rows:
        print("WARNING: query returned 0 rows. BQ streaming inserts have a short")
        print("propagation delay (~seconds). Wait and re-run the acceptance query.")
        _separator()
        print("\nManual acceptance query (run in BigQuery console or bq CLI):")
        print(query)
        return 0

    print("Acceptance receipt:")
    _separator()
    for row in rows:
        print(f"  event_id         = {row['event_id']}")
        print(f"  event_type       = {row['event_type']}")
        print(f"  idempotency_key  = {row['idempotency_key']}")
        print(f"  run_id           = {row['run_id']}")
        print(f"  occurred_at      = {row['occurred_at']}")
        print(f"  published_at     = {row['published_at']}")
        print(f"  ingested_at      = {row['ingested_at']}")
        print(f"  source           = {row['source']}")
        print(f"  dead_letter      = {row['dead_letter']}")
        print(f"  dead_letter_reason = {row['dead_letter_reason']}")
        print()

    _separator()
    print(f"Phase 3A PASS: {len(rows)} row(s) in {table_fqn} for run_id={run_id}")
    return 0


if __name__ == "__main__":
    batch = "--batch" in sys.argv
    sys.exit(main(batch_mode=batch))
