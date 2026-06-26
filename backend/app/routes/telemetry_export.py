"""Read-only telemetry XLSX export (Phase 8 / PR 8A).

Safety model — this route never builds SQL from request input:

- The dataset name is a key into a fixed allowlist (`TELEMETRY_EXPORT_DATASETS`).
  An unknown dataset is a 404 with an explicit null_reason, never a query.
- Each dataset maps to an existing, already-tenant-scoped read service in
  `telemetry_serving`. We reuse that service, so the export reflects exactly the
  rows the page shows and there is no new query surface to inject into.
- Columns are a fixed per-dataset tuple, not request input.
- Row count is bounded by the dataset's `max_limit`.
- Empty results return a valid header-only workbook plus an honest
  `X-Telemetry-Null-Reason` header — never a fabricated row.

The frontend reaches this through the same `/api/telemetry/[...path]` proxy as the
other telemetry reads; the proxy forwards the binary body for download content types.
"""
from __future__ import annotations

import io
import json
from dataclasses import dataclass
from typing import Callable
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse, Response
from openpyxl import Workbook

from app.services import telemetry_serving

router = APIRouter(prefix="/api/telemetry", tags=["telemetry-export"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@dataclass(frozen=True)
class ExportDataset:
    """One allowlisted export. `extract` reuses an existing scoped read service and
    returns (rows, null_reason); `columns` is the fixed flat column order."""
    label: str
    source: str  # human-readable source pointer (e.g. the tel_* table)
    source_kind: str  # live-rows | computed-artifact | fixture
    columns: tuple[str, ...]
    extract: Callable[[str, UUID], tuple[list[dict], str | None]]
    default_limit: int = 500
    max_limit: int = 5000


def _scalar(value: object) -> object:
    """Flatten jsonb/dict/list cells to a stable string so the cell is honest and
    spreadsheet-safe; pass scalars through unchanged (no value is altered)."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return json.dumps(value, default=str, separators=(",", ":"))


def _extract_model_runs(env_id: str, business_id: UUID) -> tuple[list[dict], str | None]:
    data = telemetry_serving.model_performance(env_id=env_id, business_id=business_id)
    return list(data.get("models") or []), data.get("null_reason")


# Allowlist. Add a dataset here (mapped to an existing scoped service) to expose it.
TELEMETRY_EXPORT_DATASETS: dict[str, ExportDataset] = {
    "model_runs": ExportDataset(
        label="Model runs",
        source="tel_model_runs",
        source_kind="live-rows",
        columns=(
            "model_name", "model_kind", "model_version", "model_alias",
            "promotion_state", "mlflow_run_id", "experiment_id", "metrics", "gate",
        ),
        extract=_extract_model_runs,
    ),
}


def _workbook_bytes(columns: tuple[str, ...], rows: list[dict]) -> bytes:
    """Build a single-sheet XLSX: a header row of the fixed columns, then one row per
    record (jsonb/dict cells flattened, no value altered). Empty rows → header only."""
    wb = Workbook()
    ws = wb.active
    ws.append(list(columns))
    for row in rows:
        ws.append([_scalar(row.get(col)) for col in columns])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@router.get("/export/datasets")
def list_export_datasets() -> dict:
    """Discoverability: the allowlisted datasets + their source kind (no data)."""
    return {
        "datasets": [
            {"dataset": k, "label": d.label, "source": d.source,
             "source_kind": d.source_kind, "max_limit": d.max_limit}
            for k, d in TELEMETRY_EXPORT_DATASETS.items()
        ]
    }


@router.get("/export/{dataset}.xlsx")
def export_dataset_xlsx(
    dataset: str,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    limit: int | None = Query(default=None, ge=1),
):
    spec = TELEMETRY_EXPORT_DATASETS.get(dataset)
    if spec is None:
        return JSONResponse(
            status_code=404,
            content={
                "null_reason": "export_dataset_not_allowed",
                "dataset": dataset,
                "allowed": sorted(TELEMETRY_EXPORT_DATASETS.keys()),
            },
        )

    eff_limit = min(limit or spec.default_limit, spec.max_limit)
    rows, null_reason = spec.extract(env_id, business_id)
    rows = rows[:eff_limit]

    payload = _workbook_bytes(spec.columns, rows)

    headers = {
        "Content-Disposition": f'attachment; filename="telemetry_{dataset}.xlsx"',
        "X-Telemetry-Export-Rows": str(len(rows)),
        "X-Telemetry-Export-Source": spec.source,
        "X-Telemetry-Export-Source-Kind": spec.source_kind,
        "X-Telemetry-Export-Limit": str(eff_limit),
    }
    if null_reason:
        headers["X-Telemetry-Null-Reason"] = null_reason
    return Response(content=payload, media_type=XLSX_MEDIA_TYPE, headers=headers)
