"""Admin tools API endpoints for MCP db operations."""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Any, Optional
import psycopg

from app.config import require_database_url

router = APIRouter(prefix="/api/admin", tags=["admin"])


class UpsertRequest(BaseModel):
    """Request schema for upsert operation."""
    table: str = Field(..., description="Table name")
    records: list[dict[str, Any]] = Field(..., description="Records to upsert")
    conflict_keys: list[str] = Field(..., description="Keys for ON CONFLICT clause")
    dry_run: bool = Field(False, description="If true, validate but don't execute")


class UpsertResponse(BaseModel):
    """Response schema for upsert operation."""
    success: bool
    dry_run: bool
    table: str
    affected_rows: Optional[int] = None
    error: Optional[str] = None


def _verify_safe_table(table: str) -> None:
    """Verify table name is in allowlist."""
    allowed_tables = [
        "businesses",
        "departments",
        "capabilities",
        "documents",
        "executions",
        "work_items",
    ]

    if table not in allowed_tables:
        raise HTTPException(
            status_code=400,
            detail=f"Table '{table}' not in allowlist. Allowed: {allowed_tables}"
        )


def _verify_safe_keys(keys: list[str]) -> None:
    """Verify no dangerous SQL in keys."""
    dangerous_patterns = [";", "--", "/*", "*/", "drop", "delete", "truncate"]

    for key in keys:
        key_lower = key.lower()
        if any(pattern in key_lower for pattern in dangerous_patterns):
            raise HTTPException(
                status_code=400,
                detail=f"Unsafe key detected: {key}"
            )


@router.post("/upsert", response_model=UpsertResponse)
def upsert(req: UpsertRequest):
    """Upsert records into a table.

    Performs INSERT ... ON CONFLICT ... DO UPDATE.
    Only allowed on specific tables with required conflict keys.
    """

    # Validate table and keys
    _verify_safe_table(req.table)
    _verify_safe_keys(req.conflict_keys)

    if not req.records:
        raise HTTPException(status_code=400, detail="No records provided")

    if not req.conflict_keys:
        raise HTTPException(status_code=400, detail="No conflict_keys provided")

    # Dry run: just validate and return
    if req.dry_run:
        return UpsertResponse(
            success=True,
            dry_run=True,
            table=req.table,
            affected_rows=len(req.records),
        )

    # Execute upsert
    try:
        db_url = require_database_url()

        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                affected = 0

                for record in req.records:
                    # Build column list
                    columns = list(record.keys())
                    if not columns:
                        continue

                    # Build placeholders
                    placeholders = ", ".join(["%s"] * len(columns))
                    column_names = ", ".join(columns)

                    # Build update clause (exclude conflict keys from update)
                    update_columns = [c for c in columns if c not in req.conflict_keys]
                    update_clause = ", ".join([f"{c} = EXCLUDED.{c}" for c in update_columns])

                    # Build conflict target
                    conflict_target = ", ".join(req.conflict_keys)

                    # Build SQL
                    sql = f"""
                        INSERT INTO {req.table} ({column_names})
                        VALUES ({placeholders})
                        ON CONFLICT ({conflict_target})
                        DO UPDATE SET {update_clause}
                    """

                    # Execute
                    values = [record[c] for c in columns]
                    cur.execute(sql, values)
                    affected += cur.rowcount

                conn.commit()

        return UpsertResponse(
            success=True,
            dry_run=False,
            table=req.table,
            affected_rows=affected,
        )

    except psycopg.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
