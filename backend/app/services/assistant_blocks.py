"""Canonical assistant response block helpers for Winston copilot surfaces."""
from __future__ import annotations

from collections.abc import Iterable
from typing import Any
import uuid


def _block_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def markdown_block(markdown: str, *, block_id: str | None = None) -> dict[str, Any]:
    return {
        "type": "markdown_text",
        "block_id": block_id or _block_id("md"),
        "markdown": markdown,
    }


def kpi_group_block(
    items: Iterable[dict[str, Any]],
    *,
    title: str | None = None,
    block_id: str | None = None,
    source_block_id: str | None = None,
) -> dict[str, Any]:
    block: dict[str, Any] = {
        "type": "kpi_group",
        "block_id": block_id or _block_id("kpi"),
        "title": title,
        "items": list(items),
    }
    if source_block_id:
        block["source_block_id"] = source_block_id
    return block


def table_block(
    *,
    title: str | None,
    columns: list[str],
    rows: list[dict[str, Any]],
    ranked: bool = False,
    export_name: str | None = None,
    block_id: str | None = None,
    source_block_id: str | None = None,
) -> dict[str, Any]:
    block: dict[str, Any] = {
        "type": "table",
        "block_id": block_id or _block_id("tbl"),
        "title": title,
        "columns": columns,
        "rows": rows,
        "ranked": ranked,
        "export_name": export_name,
    }
    if source_block_id:
        block["source_block_id"] = source_block_id
    return block


def chart_block(
    *,
    chart_type: str,
    title: str,
    x_key: str,
    y_keys: list[str],
    data: list[dict[str, Any]],
    description: str | None = None,
    series_key: str | None = None,
    format: str | None = None,
    stacked: bool | None = None,
    block_id: str | None = None,
    source_block_id: str | None = None,
) -> dict[str, Any]:
    block: dict[str, Any] = {
        "type": "chart",
        "block_id": block_id or _block_id("chart"),
        "chart_type": chart_type,
        "title": title,
        "description": description,
        "x_key": x_key,
        "y_keys": y_keys,
        "series_key": series_key,
        "data": data,
    }
    if format:
        block["format"] = format
    if stacked is not None:
        block["stacked"] = stacked
    if source_block_id:
        block["source_block_id"] = source_block_id
    return block


def workflow_result_block(
    *,
    title: str,
    status: str,
    summary: str,
    metrics: list[dict[str, Any]] | None = None,
    actions: list[dict[str, Any]] | None = None,
    block_id: str | None = None,
) -> dict[str, Any]:
    return {
        "type": "workflow_result",
        "block_id": block_id or _block_id("flow"),
        "title": title,
        "status": status,
        "summary": summary,
        "metrics": metrics or [],
        "actions": actions or [],
    }


def confirmation_block(
    *,
    action: str,
    summary: str,
    provided_params: dict[str, Any] | None = None,
    missing_fields: list[str] | None = None,
    confirm_label: str | None = None,
    block_id: str | None = None,
) -> dict[str, Any]:
    return {
        "type": "confirmation",
        "block_id": block_id or _block_id("confirm"),
        "action": action,
        "summary": summary,
        "provided_params": provided_params or {},
        "missing_fields": missing_fields or [],
        "confirm_label": confirm_label or "Confirm",
    }


def error_block(
    *,
    message: str,
    title: str | None = None,
    recoverable: bool = True,
    block_id: str | None = None,
) -> dict[str, Any]:
    return {
        "type": "error",
        "block_id": block_id or _block_id("error"),
        "title": title,
        "message": message,
        "recoverable": recoverable,
    }


def citations_block(
    items: Iterable[dict[str, Any]],
    *,
    block_id: str | None = None,
) -> dict[str, Any]:
    return {
        "type": "citations",
        "block_id": block_id or _block_id("cite"),
        "items": list(items),
    }


def tool_activity_block(
    items: Iterable[dict[str, Any]],
    *,
    block_id: str | None = None,
) -> dict[str, Any]:
    return {
        "type": "tool_activity",
        "block_id": block_id or _block_id("tools"),
        "items": list(items),
    }


def _summary_from_card(card: dict[str, Any], result_type: str) -> str:
    summary_parts: list[str] = []
    subtitle = card.get("subtitle")
    if subtitle:
        summary_parts.append(str(subtitle))
    metric_count = len(card.get("metrics") or [])
    if metric_count:
        summary_parts.append(f"{metric_count} KPI(s)")
    if card.get("table"):
        summary_parts.append(f"{len(card['table'].get('rows') or [])} row(s)")
    if not summary_parts:
        summary_parts.append(result_type.replace("_", " "))
    return " • ".join(summary_parts)


def _table_from_object_rows(
    title: str,
    rows: list[dict[str, Any]],
    *,
    source_block_id: str | None = None,
) -> dict[str, Any] | None:
    if not rows:
        return None
    columns = list(rows[0].keys())
    return table_block(
        title=title,
        columns=columns,
        rows=rows,
        ranked=True,
        export_name=title.lower().replace(" ", "_"),
        source_block_id=source_block_id,
    )


def _chart_from_query_card(card: dict[str, Any], *, source_block_id: str | None = None) -> dict[str, Any] | None:
    rows = card.get("rows") or []
    columns = card.get("columns") or []
    if not rows or len(columns) < 2:
        return None
    x_key = columns[0]
    y_keys = [column for column in columns[1:] if any(isinstance(row.get(column), (int, float)) for row in rows)]
    if not y_keys:
        return None
    hint = str(card.get("visualization_hint") or "").lower()
    chart_type = "line" if "line" in hint or "trend" in hint else "grouped_bar" if "group" in hint else "bar"
    stacked = "stack" in hint
    return chart_block(
        chart_type=chart_type,
        title=card.get("title") or "Chart",
        x_key=x_key,
        y_keys=y_keys,
        data=rows,
        format="dollar" if any("noi" in key.lower() or "revenue" in key.lower() or "expense" in key.lower() for key in y_keys) else "number",
        stacked=stacked,
        source_block_id=source_block_id,
    )


def legacy_structured_result_to_blocks(result_type: str, card: dict[str, Any]) -> list[dict[str, Any]]:
    base_id = _block_id("legacy")
    blocks: list[dict[str, Any]] = [
        workflow_result_block(
            title=card.get("title") or result_type.replace("_", " ").title(),
            status="completed",
            summary=_summary_from_card(card, result_type),
            metrics=card.get("metrics") or [],
            actions=card.get("actions") or [],
            block_id=base_id,
        )
    ]

    metrics = card.get("metrics") or []
    if metrics:
        blocks.append(
            kpi_group_block(
                metrics,
                title=card.get("title"),
                source_block_id=base_id,
            )
        )

    if card.get("table"):
        blocks.append(
            table_block(
                title=card.get("title"),
                columns=card["table"].get("columns") or [],
                rows=card["table"].get("rows") or [],
                ranked="top" in (card.get("title") or "").lower(),
                export_name=(card.get("title") or result_type).lower().replace(" ", "_"),
                source_block_id=base_id,
            )
        )

    for key, title in (
        ("tiers", f"{card.get('title') or 'Result'} tiers"),
        ("partners", f"{card.get('title') or 'Result'} partners"),
        ("assets", f"{card.get('title') or 'Result'} assets"),
        ("scenarios", f"{card.get('title') or 'Result'} scenarios"),
        ("session_waterfall_runs", f"{card.get('title') or 'Result'} session runs"),
    ):
        rows = card.get(key) or []
        table = _table_from_object_rows(title, rows, source_block_id=base_id)
        if table:
            blocks.append(table)

    heatmap = card.get("heatmap")
    if heatmap:
        row_headers = heatmap.get("row_headers") or []
        col_headers = heatmap.get("col_headers") or []
        matrix_rows = heatmap.get("rows") or []
        rows = []
        for idx, row in enumerate(matrix_rows):
            row_map = {"row": row_headers[idx] if idx < len(row_headers) else f"row_{idx}"}
            for c_idx, column in enumerate(col_headers):
                row_map[column] = row[c_idx] if c_idx < len(row) else None
            rows.append(row_map)
        blocks.append(
            table_block(
                title=heatmap.get("title") or card.get("title"),
                columns=["row", *col_headers],
                rows=rows,
                export_name="heatmap_matrix",
                source_block_id=base_id,
            )
        )

    sections = card.get("sections") or []
    for section in sections:
        content = str(section.get("content") or "").strip()
        if content:
            title = section.get("title") or "Notes"
            blocks.append(markdown_block(f"### {title}\n\n{content}"))

    if result_type == "query_result":
        chart = _chart_from_query_card(card, source_block_id=base_id)
        if chart:
            blocks.append(chart)

    return blocks
