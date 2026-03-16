"""CRE Data Egress Service.

Exports intelligence graph data to S3, SFTP, or Snowflake targets.
Supports incremental sync via high-water-mark tracking.
"""
from __future__ import annotations

import csv
import io
import json
import logging
from typing import Any
from uuid import UUID

from app.db import get_cursor

log = logging.getLogger(__name__)

# Tables eligible for egress
_EXPORTABLE_TABLES = {
    "dim_property", "dim_entity", "dim_geography", "dim_parcel", "dim_building",
    "bridge_property_entity", "bridge_property_geography",
    "fact_property_timeseries", "fact_market_timeseries",
    "feature_store", "forecast_registry", "forecast_questions",
    "cre_entity_relationship",
}


def _encrypt_config(config: dict) -> bytes:
    """Encrypt connection details. Uses Fernet if available, else base64 fallback."""
    import base64
    import os
    key = os.environ.get("EGRESS_ENCRYPTION_KEY")
    raw = json.dumps(config).encode()
    if key:
        try:
            from cryptography.fernet import Fernet
            f = Fernet(key.encode() if isinstance(key, str) else key)
            return f.encrypt(raw)
        except ImportError:
            log.warning("cryptography not installed — using base64 fallback (NOT secure for production)")
    return base64.b64encode(raw)


def _decrypt_config(data: bytes) -> dict:
    """Decrypt connection details."""
    import base64
    import os
    key = os.environ.get("EGRESS_ENCRYPTION_KEY")
    if key:
        try:
            from cryptography.fernet import Fernet
            f = Fernet(key.encode() if isinstance(key, str) else key)
            return json.loads(f.decrypt(data))
        except ImportError:
            pass
    return json.loads(base64.b64decode(data))


def create_config(
    *,
    env_id: UUID,
    business_id: UUID,
    config_name: str,
    transport: str,
    connection_details: dict,
    target_tables: list[str],
    schedule_cron: str | None = None,
) -> dict:
    """Create an egress configuration."""
    if transport not in ("s3", "sftp", "snowflake"):
        raise ValueError(f"Unsupported transport: {transport}")

    invalid = set(target_tables) - _EXPORTABLE_TABLES
    if invalid:
        raise ValueError(f"Non-exportable tables: {invalid}")

    encrypted = _encrypt_config(connection_details)

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cre_egress_config
                (env_id, business_id, config_name, transport, connection_details, target_tables, schedule_cron)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING config_id, env_id, business_id, config_name, transport, target_tables, schedule_cron, is_active, created_at
            """,
            (str(env_id), str(business_id), config_name, transport, encrypted, target_tables, schedule_cron),
        )
        return cur.fetchone()


def run_egress(*, config_id: UUID) -> dict:
    """Execute an egress run: read from intelligence tables, write to target."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM cre_egress_config WHERE config_id = %s",
            (str(config_id),),
        )
        config = cur.fetchone()

    if not config:
        raise LookupError(f"Egress config {config_id} not found")

    connection = _decrypt_config(bytes(config["connection_details"]))
    target_tables = config["target_tables"]
    transport = config["transport"]

    # Get high water mark from last successful run
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT high_water_mark FROM cre_egress_run
            WHERE config_id = %s AND status = 'success'
            ORDER BY started_at DESC LIMIT 1
            """,
            (str(config_id),),
        )
        last = cur.fetchone()
        hwm = last["high_water_mark"] if last else None

        # Create run record
        cur.execute(
            "INSERT INTO cre_egress_run (config_id, status) VALUES (%s, 'running') RETURNING *",
            (str(config_id),),
        )
        run = cur.fetchone()

    run_id = str(run["run_id"])
    total_rows = 0

    try:
        for table in target_tables:
            if table not in _EXPORTABLE_TABLES:
                continue

            rows = _export_table(table, hwm, config["env_id"], config["business_id"])
            total_rows += len(rows)

            if rows:
                if transport == "s3":
                    _write_s3(connection, table, rows)
                elif transport == "sftp":
                    _write_sftp(connection, table, rows)
                elif transport == "snowflake":
                    _write_snowflake(connection, table, rows)

        # Update run as success
        from datetime import datetime, timezone
        new_hwm = datetime.now(timezone.utc)

        with get_cursor() as cur:
            cur.execute(
                """
                UPDATE cre_egress_run
                SET status = 'success', rows_exported = %s, high_water_mark = %s, finished_at = now()
                WHERE run_id = %s RETURNING *
                """,
                (total_rows, new_hwm, run_id),
            )
            return cur.fetchone()

    except Exception as exc:
        with get_cursor() as cur:
            cur.execute(
                "UPDATE cre_egress_run SET status = 'failed', error_summary = %s, finished_at = now() WHERE run_id = %s",
                (str(exc), run_id),
            )
        raise


def _export_table(table: str, hwm: Any, env_id: str, business_id: str) -> list[dict]:
    """Query a table for rows to export, respecting high water mark."""
    with get_cursor() as cur:
        if hwm:
            cur.execute(
                f"SELECT * FROM {table} WHERE env_id = %s AND business_id = %s AND created_at > %s ORDER BY created_at LIMIT 10000",
                (str(env_id), str(business_id), hwm),
            )
        else:
            cur.execute(
                f"SELECT * FROM {table} WHERE env_id = %s AND business_id = %s ORDER BY created_at LIMIT 10000",
                (str(env_id), str(business_id)),
            )
        return cur.fetchall()


def _write_s3(connection: dict, table: str, rows: list[dict]) -> None:
    """Write rows as Parquet to S3."""
    try:
        import boto3
        import pyarrow as pa
        import pyarrow.parquet as pq

        s3 = boto3.client(
            "s3",
            aws_access_key_id=connection.get("aws_access_key_id"),
            aws_secret_access_key=connection.get("aws_secret_access_key"),
            region_name=connection.get("region", "us-east-1"),
        )

        # Convert to Parquet
        table_data = pa.Table.from_pylist([{k: str(v) for k, v in row.items()} for row in rows])
        buf = io.BytesIO()
        pq.write_table(table_data, buf)
        buf.seek(0)

        bucket = connection["bucket"]
        prefix = connection.get("prefix", "cre-egress")
        key = f"{prefix}/{table}/{table}_export.parquet"

        s3.upload_fileobj(buf, bucket, key)
        log.info("S3 egress: %d rows → s3://%s/%s", len(rows), bucket, key)

    except ImportError as exc:
        raise RuntimeError(f"S3 egress requires boto3 and pyarrow: {exc}")


def _write_sftp(connection: dict, table: str, rows: list[dict]) -> None:
    """Write rows as CSV to SFTP."""
    try:
        import paramiko

        transport = paramiko.Transport((connection["host"], connection.get("port", 22)))
        transport.connect(username=connection["username"], password=connection.get("password"))
        sftp = paramiko.SFTPClient.from_transport(transport)

        buf = io.StringIO()
        if rows:
            writer = csv.DictWriter(buf, fieldnames=[str(k) for k in rows[0].keys()])
            writer.writeheader()
            for row in rows:
                writer.writerow({str(k): str(v) for k, v in row.items()})

        remote_path = f"{connection.get('remote_dir', '/cre-egress')}/{table}.csv"
        with sftp.file(remote_path, "w") as f:
            f.write(buf.getvalue())

        sftp.close()
        transport.close()
        log.info("SFTP egress: %d rows → %s:%s", len(rows), connection["host"], remote_path)

    except ImportError as exc:
        raise RuntimeError(f"SFTP egress requires paramiko: {exc}")


def _write_snowflake(connection: dict, table: str, rows: list[dict]) -> None:
    """Write rows to Snowflake via internal stage + COPY INTO."""
    try:
        import snowflake.connector

        conn = snowflake.connector.connect(
            account=connection["account"],
            user=connection["user"],
            password=connection["password"],
            warehouse=connection.get("warehouse", "COMPUTE_WH"),
            database=connection["database"],
            schema=connection.get("schema", "PUBLIC"),
        )
        cur = conn.cursor()

        # Create table if not exists (simple text columns)
        if rows:
            cols = ", ".join(f'"{k}" TEXT' for k in rows[0].keys())
            cur.execute(f'CREATE TABLE IF NOT EXISTS "{table}" ({cols})')

            # Stage and load
            stage_name = f"@~/{table}_stage"
            buf = io.StringIO()
            writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            for row in rows:
                writer.writerow({k: str(v) for k, v in row.items()})

            cur.execute(f"PUT 'file:///dev/stdin' {stage_name}")
            cur.execute(f'COPY INTO "{table}" FROM {stage_name} FILE_FORMAT = (TYPE = CSV SKIP_HEADER = 1)')

        cur.close()
        conn.close()
        log.info("Snowflake egress: %d rows → %s.%s", len(rows), connection["database"], table)

    except ImportError as exc:
        raise RuntimeError(f"Snowflake egress requires snowflake-connector-python: {exc}")
