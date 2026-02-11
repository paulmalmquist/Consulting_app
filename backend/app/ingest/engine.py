"""Deterministic ingestion engine for CSV/XLSX manual uploads."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import openpyxl

ENGINE_VERSION = "ingest-engine-v1"
DEFAULT_PREVIEW_ROWS = 50

TARGET_SCHEMAS: dict[str, dict[str, Any]] = {
    "vendor": {
        "label": "Vendor",
        "columns": [
            {"name": "name", "type": "string", "required": True},
            {"name": "legal_name", "type": "string", "required": False},
            {"name": "tax_id", "type": "string", "required": False},
            {"name": "payment_terms", "type": "string", "required": False},
            {"name": "email", "type": "string", "required": False},
            {"name": "phone", "type": "string", "required": False},
        ],
    },
    "customer": {
        "label": "Customer",
        "columns": [
            {"name": "name", "type": "string", "required": True},
            {"name": "email", "type": "string", "required": False},
            {"name": "phone", "type": "string", "required": False},
            {"name": "status", "type": "string", "required": False},
        ],
    },
    "cashflow_event": {
        "label": "Cash Flow Event",
        "columns": [
            {"name": "event_date", "type": "date", "required": True},
            {"name": "event_type", "type": "string", "required": True},
            {"name": "amount", "type": "float", "required": True},
            {"name": "currency", "type": "string", "required": False},
            {"name": "description", "type": "string", "required": False},
        ],
    },
    "trial_balance": {
        "label": "Trial Balance",
        "columns": [
            {"name": "period", "type": "string", "required": True},
            {"name": "account", "type": "string", "required": True},
            {"name": "ending_balance", "type": "float", "required": True},
            {"name": "debit", "type": "float", "required": False},
            {"name": "credit", "type": "float", "required": False},
        ],
    },
    "gl_transaction": {
        "label": "GL Detail",
        "columns": [
            {"name": "txn_date", "type": "date", "required": True},
            {"name": "account", "type": "string", "required": True},
            {"name": "description", "type": "string", "required": False},
            {"name": "amount", "type": "float", "required": True},
            {"name": "debit", "type": "float", "required": False},
            {"name": "credit", "type": "float", "required": False},
            {"name": "reference", "type": "string", "required": False},
        ],
    },
    "deal_pipeline_deal": {
        "label": "Deal Pipeline",
        "columns": [
            {"name": "deal_name", "type": "string", "required": True},
            {"name": "company", "type": "string", "required": False},
            {"name": "stage", "type": "string", "required": False},
            {"name": "owner", "type": "string", "required": False},
            {"name": "value", "type": "float", "required": False},
            {"name": "probability", "type": "float", "required": False},
            {"name": "close_date", "type": "date", "required": False},
        ],
    },
}


def stable_json_dumps(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def compute_run_hash(source_version_id: str, recipe_payload: dict[str, Any], engine_version: str = ENGINE_VERSION) -> str:
    payload = {
        "source_version_id": source_version_id,
        "recipe": recipe_payload,
        "engine_version": engine_version,
    }
    canonical = stable_json_dumps(payload)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def get_target_schema(table_key: str) -> dict[str, Any]:
    return TARGET_SCHEMAS.get(
        table_key,
        {
            "label": "Custom Table",
            "columns": [],
        },
    )


def list_stock_targets() -> list[dict[str, Any]]:
    return [
        {
            "key": key,
            "label": schema["label"],
            "columns": schema["columns"],
            "is_canonical": True,
        }
        for key, schema in TARGET_SCHEMAS.items()
    ]


def _to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def _normalize_column_name(name: str) -> str:
    cleaned = re.sub(r"[\u00a0\s]+", " ", name.strip())
    cleaned = re.sub(r"[^a-zA-Z0-9 _-]", "", cleaned)
    cleaned = cleaned.replace("/", " ").replace("-", " ")
    normalized = re.sub(r"\s+", "_", cleaned).strip("_").lower()
    return normalized or "column"


def _parse_numeric(value: Any) -> float:
    if value is None or (isinstance(value, str) and value.strip() == ""):
        raise ValueError("Empty numeric value")
    if isinstance(value, (int, float, Decimal)):
        return float(value)

    raw = str(value).strip()
    if raw == "":
        raise ValueError("Empty numeric value")

    negative = raw.startswith("(") and raw.endswith(")")
    raw = raw.replace("(", "").replace(")", "")
    raw = raw.replace("$", "").replace(",", "")
    raw = raw.replace("USD", "").replace("usd", "").strip()

    if raw.endswith("%"):
        raw = raw[:-1].strip()

    numeric = float(raw)
    return -numeric if negative else numeric


def _parse_date(value: Any) -> str:
    if value is None or (isinstance(value, str) and value.strip() == ""):
        raise ValueError("Empty date value")

    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()

    raw = str(value).strip()
    for fmt in (
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%m/%d/%y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%b %d %Y",
        "%B %d %Y",
        "%Y.%m.%d",
    ):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
    except ValueError as exc:
        raise ValueError(f"Unparseable date: {raw}") from exc


def _cast_value(value: Any, cast_type: str) -> Any:
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None

    cast = cast_type.lower().strip()
    if cast in {"string", "text"}:
        return str(value).strip()
    if cast in {"int", "integer"}:
        return int(round(_parse_numeric(value)))
    if cast in {"float", "number", "numeric", "decimal"}:
        return float(_parse_numeric(value))
    if cast == "date":
        return _parse_date(value)
    if cast in {"bool", "boolean"}:
        if isinstance(value, bool):
            return value
        normalized = str(value).strip().lower()
        if normalized in {"true", "1", "yes", "y"}:
            return True
        if normalized in {"false", "0", "no", "n"}:
            return False
        raise ValueError(f"Unparseable boolean: {value}")

    return value


def _infer_value_type(value: Any) -> str:
    if value is None:
        return "empty"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, Decimal):
        return "float"
    if isinstance(value, (datetime, date)):
        return "date"

    raw = str(value).strip()
    if raw == "":
        return "empty"

    try:
        _parse_date(raw)
        return "date"
    except ValueError:
        pass

    try:
        _parse_numeric(raw)
        if "$" in raw or "," in raw or raw.startswith("("):
            return "currency"
        if "." in raw:
            return "float"
        return "int"
    except ValueError:
        return "string"


def _infer_column_type(values: list[Any]) -> str:
    type_counts: Counter[str] = Counter(_infer_value_type(v) for v in values)
    type_counts.pop("empty", None)

    if not type_counts:
        return "string"

    keys = set(type_counts)
    if keys <= {"int"}:
        return "int"
    if keys <= {"int", "float", "currency"}:
        return "float" if "float" in keys else "currency"
    if keys <= {"date"}:
        return "date"
    if keys <= {"bool"}:
        return "bool"
    return "string"


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def _looks_like_totals_row(row_values: list[Any]) -> bool:
    if not row_values:
        return False

    head = _to_text(row_values[0]).lower()
    if not any(token in head for token in ("total", "subtotal", "grand total")):
        return False

    numeric_cells = 0
    checked = 0
    for value in row_values[1:]:
        if _is_blank(value):
            continue
        checked += 1
        try:
            _parse_numeric(value)
            numeric_cells += 1
        except ValueError:
            pass

    if checked == 0:
        return False
    return numeric_cells / checked >= 0.7


def _detect_header_row(rows: list[list[Any]], max_scan: int = 10) -> int:
    if not rows:
        return 0

    upper = min(len(rows), max_scan)
    best_idx = 0
    best_score = float("-inf")

    for idx in range(upper):
        row = rows[idx]
        if not row:
            continue

        non_empty = [_to_text(v) for v in row if _to_text(v)]
        if len(non_empty) < 2:
            continue

        alpha_count = sum(1 for v in non_empty if re.search(r"[A-Za-z]", v))
        numeric_count = sum(1 for v in non_empty if _infer_value_type(v) in {"int", "float", "currency"})
        unique_count = len(set(v.lower() for v in non_empty))
        duplicate_penalty = len(non_empty) - unique_count

        score = (2.0 * len(non_empty)) + (1.2 * alpha_count) - (0.8 * numeric_count) - (0.6 * duplicate_penalty)
        if score > best_score:
            best_score = score
            best_idx = idx

    return best_idx


def _build_headers(rows: list[list[Any]], header_row_index: int) -> list[str]:
    header_row = rows[header_row_index] if 0 <= header_row_index < len(rows) else []
    prefix_row = rows[header_row_index - 1] if header_row_index > 0 else []

    width = max(len(header_row), len(prefix_row), max((len(r) for r in rows), default=0))
    headers: list[str] = []
    seen: dict[str, int] = {}

    for idx in range(width):
        raw_header = _to_text(header_row[idx]) if idx < len(header_row) else ""
        raw_prefix = _to_text(prefix_row[idx]) if idx < len(prefix_row) else ""

        if raw_header and raw_prefix and raw_prefix.lower() != raw_header.lower():
            candidate = f"{raw_prefix}_{raw_header}"
        elif raw_header:
            candidate = raw_header
        elif raw_prefix:
            candidate = raw_prefix
        else:
            candidate = f"column_{idx + 1}"

        normalized = _normalize_column_name(candidate)
        count = seen.get(normalized, 0) + 1
        seen[normalized] = count
        if count > 1:
            normalized = f"{normalized}_{count}"

        headers.append(normalized)

    return headers


def _matrix_to_records(rows: list[list[Any]], headers: list[str], header_row_index: int) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    start = header_row_index + 1

    for row_num, row in enumerate(rows[start:], start=start + 1):
        if not row:
            continue

        values = [row[idx] if idx < len(row) else None for idx in range(len(headers))]
        if all(_is_blank(v) for v in values):
            continue
        if _looks_like_totals_row(values):
            continue

        record: dict[str, Any] = {"_row_number": row_num}
        for idx, header in enumerate(headers):
            value = values[idx]
            if isinstance(value, str):
                value = value.strip()
            record[header] = value

        records.append(record)

    return records


def _profile_from_rows(sheet_name: str, rows: list[list[Any]], settings: dict[str, Any]) -> dict[str, Any]:
    forced_header = settings.get("header_row_index")
    header_row_index = int(forced_header) if isinstance(forced_header, int) else _detect_header_row(rows)
    headers = _build_headers(rows, header_row_index)
    records = _matrix_to_records(rows, headers, header_row_index)

    columns: list[dict[str, Any]] = []
    for header in headers:
        col_values = [rec.get(header) for rec in records][:250]
        non_empty_values = [v for v in col_values if not _is_blank(v)]
        distinct = len({str(v).strip().lower() for v in non_empty_values})
        sample_values = [str(v) for v in non_empty_values[:6]]

        columns.append(
            {
                "name": header,
                "inferred_type": _infer_column_type(col_values),
                "nonnull_count": len(non_empty_values),
                "distinct_count": distinct,
                "sample_values": sample_values,
            }
        )

    key_candidates: list[dict[str, Any]] = []
    for header in headers:
        vals = [rec.get(header) for rec in records if not _is_blank(rec.get(header))]
        if not vals:
            continue

        uniq = len({str(v).strip().lower() for v in vals})
        uniqueness_ratio = uniq / len(vals)
        completeness = len(vals) / max(len(records), 1)

        if uniqueness_ratio >= 0.95 and completeness >= 0.9:
            key_candidates.append(
                {
                    "column": header,
                    "uniqueness_ratio": round(uniqueness_ratio, 4),
                    "completeness_ratio": round(completeness, 4),
                }
            )

    sample_rows = [{k: v for k, v in rec.items() if k != "_row_number"} for rec in records[:20]]

    return {
        "sheet_name": sheet_name,
        "header_row_index": header_row_index,
        "total_rows": len(records),
        "columns": columns,
        "sample_rows": sample_rows,
        "key_candidates": key_candidates,
        "headers": headers,
        "records": records,
    }


def _decode_csv_bytes(raw_bytes: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("utf-8", errors="ignore")


def _parse_csv_matrix(raw_bytes: bytes, settings: dict[str, Any]) -> tuple[list[list[str]], str]:
    text = _decode_csv_bytes(raw_bytes)
    delimiter = settings.get("delimiter")

    if not delimiter:
        sample = text[:8192]
        try:
            sniffed = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            delimiter = sniffed.delimiter
        except csv.Error:
            delimiter = ","

    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = [list(row) for row in reader]
    return rows, delimiter


def _parse_xlsx_matrices(raw_bytes: bytes) -> dict[str, list[list[Any]]]:
    workbook = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True, read_only=True)
    matrices: dict[str, list[list[Any]]] = {}
    for ws in workbook.worksheets:
        matrix: list[list[Any]] = []
        for row in ws.iter_rows(values_only=True):
            matrix.append(list(row))
        matrices[ws.title] = matrix
    return matrices


def profile_file(raw_bytes: bytes, file_type: str, settings: dict[str, Any] | None = None) -> dict[str, Any]:
    settings = settings or {}
    normalized_type = file_type.lower().strip()

    sheet_profiles: list[dict[str, Any]] = []
    detected_tables: list[dict[str, Any]] = []

    if normalized_type == "csv":
        matrix, detected_delimiter = _parse_csv_matrix(raw_bytes, settings)
        profile = _profile_from_rows(settings.get("sheet_name") or "CSV", matrix, settings)
        profile["detected_delimiter"] = detected_delimiter
        sheet_profiles.append(profile)
        detected_tables.append(
            {
                "sheet_name": profile["sheet_name"],
                "row_count": profile["total_rows"],
                "column_count": len(profile["columns"]),
            }
        )
    elif normalized_type == "xlsx":
        matrices = _parse_xlsx_matrices(raw_bytes)
        requested_sheet = settings.get("sheet_name")

        for sheet_name, matrix in matrices.items():
            if requested_sheet and sheet_name != requested_sheet:
                continue
            profile = _profile_from_rows(sheet_name, matrix, settings)
            sheet_profiles.append(profile)
            detected_tables.append(
                {
                    "sheet_name": sheet_name,
                    "row_count": profile["total_rows"],
                    "column_count": len(profile["columns"]),
                }
            )

        if requested_sheet and not sheet_profiles:
            raise ValueError(f"Sheet not found: {requested_sheet}")
    else:
        raise ValueError(f"Unsupported file type: {file_type}")

    response_sheets = []
    for sheet in sheet_profiles:
        response_sheets.append(
            {
                "sheet_name": sheet["sheet_name"],
                "header_row_index": sheet["header_row_index"],
                "total_rows": sheet["total_rows"],
                "columns": sheet["columns"],
                "sample_rows": sheet["sample_rows"],
                "key_candidates": sheet["key_candidates"],
                **({"detected_delimiter": sheet.get("detected_delimiter")} if sheet.get("detected_delimiter") else {}),
            }
        )

    return {
        "file_type": normalized_type,
        "sheets": response_sheets,
        "detected_tables": detected_tables,
    }


def _extract_records_for_recipe(raw_bytes: bytes, file_type: str, settings: dict[str, Any] | None = None) -> dict[str, Any]:
    settings = settings or {}
    normalized_type = file_type.lower().strip()

    if normalized_type == "csv":
        matrix, detected_delimiter = _parse_csv_matrix(raw_bytes, settings)
        profile = _profile_from_rows(settings.get("sheet_name") or "CSV", matrix, settings)
        return {
            "sheet_name": profile["sheet_name"],
            "header_row_index": profile["header_row_index"],
            "headers": profile["headers"],
            "records": profile["records"],
            "detected_delimiter": detected_delimiter,
        }

    if normalized_type == "xlsx":
        matrices = _parse_xlsx_matrices(raw_bytes)
        requested_sheet = settings.get("sheet_name")
        if requested_sheet:
            matrix = matrices.get(requested_sheet)
            if matrix is None:
                raise ValueError(f"Sheet not found: {requested_sheet}")
            profile = _profile_from_rows(requested_sheet, matrix, settings)
            return {
                "sheet_name": profile["sheet_name"],
                "header_row_index": profile["header_row_index"],
                "headers": profile["headers"],
                "records": profile["records"],
            }

        # Default to first worksheet in workbook order.
        first_sheet_name = next(iter(matrices.keys()), None)
        if first_sheet_name is None:
            return {
                "sheet_name": "Sheet1",
                "header_row_index": 0,
                "headers": [],
                "records": [],
            }

        profile = _profile_from_rows(first_sheet_name, matrices[first_sheet_name], settings)
        return {
            "sheet_name": profile["sheet_name"],
            "header_row_index": profile["header_row_index"],
            "headers": profile["headers"],
            "records": profile["records"],
        }

    raise ValueError(f"Unsupported file type: {file_type}")


def _apply_mapping_transform(value: Any, transform: dict[str, Any]) -> Any:
    if not transform:
        return value

    current = value

    if transform.get("trim") and isinstance(current, str):
        current = current.strip()

    split_cfg = transform.get("split")
    if split_cfg and isinstance(current, str):
        delimiter = str(split_cfg.get("delimiter", " "))
        index = int(split_cfg.get("index", 0))
        pieces = [part.strip() for part in current.split(delimiter)]
        current = pieces[index] if 0 <= index < len(pieces) else None

    regex_extract = transform.get("regex_extract")
    if regex_extract and isinstance(current, str):
        pattern = regex_extract.get("pattern") if isinstance(regex_extract, dict) else str(regex_extract)
        group = int(regex_extract.get("group", 1)) if isinstance(regex_extract, dict) else 1
        match = re.search(pattern, current)
        current = match.group(group) if match else None

    lookup_map = transform.get("lookup_map")
    if isinstance(lookup_map, dict) and current is not None:
        key = str(current)
        lowered = key.lower()
        if key in lookup_map:
            current = lookup_map[key]
        elif lowered in lookup_map:
            current = lookup_map[lowered]

    if transform.get("currency_parse"):
        current = _parse_numeric(current)

    if transform.get("date_parse"):
        current = _parse_date(current)

    if transform.get("uppercase") and isinstance(current, str):
        current = current.upper()

    if transform.get("lowercase") and isinstance(current, str):
        current = current.lower()

    if transform.get("cast"):
        current = _cast_value(current, str(transform["cast"]))

    if (current is None or (isinstance(current, str) and current == "")) and "default" in transform:
        current = transform["default"]

    return current


def _find_source_value(record: dict[str, Any], source_column: str) -> Any:
    if source_column in record:
        return record[source_column]

    normalized_requested = _normalize_column_name(source_column)
    for key, value in record.items():
        if key.startswith("_"):
            continue
        if _normalize_column_name(key) == normalized_requested:
            return value
    return None


def _apply_mappings(records: list[dict[str, Any]], mappings: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    transformed_rows: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    ordered_mappings = sorted(
        mappings,
        key=lambda m: (
            int(m.get("mapping_order", 0)),
            str(m.get("source_column", "")),
            str(m.get("target_column", "")),
        ),
    )

    for record in records:
        row_number = int(record.get("_row_number", 0) or 0)
        out: dict[str, Any] = {"_row_number": row_number}

        for mapping in ordered_mappings:
            source_column = str(mapping.get("source_column", "")).strip()
            target_column = str(mapping.get("target_column", "")).strip()
            transform_cfg = mapping.get("transform_json") or {}

            if not source_column or not target_column:
                continue

            value = _find_source_value(record, source_column)
            try:
                out[target_column] = _apply_mapping_transform(value, transform_cfg)
            except (ValueError, InvalidOperation) as exc:
                out[target_column] = None
                errors.append(
                    {
                        "row_number": row_number,
                        "column_name": target_column,
                        "error_code": "transform_error",
                        "message": str(exc),
                        "raw_value": None if value is None else str(value),
                    }
                )

        transformed_rows.append(out)

    return transformed_rows, errors


def _apply_filter(rows: list[dict[str, Any]], config: dict[str, Any]) -> list[dict[str, Any]]:
    conditions = config.get("where") or config.get("conditions") or []
    if not conditions:
        return rows

    def _matches(row: dict[str, Any]) -> bool:
        for condition in conditions:
            col = condition.get("column")
            op = str(condition.get("op", "eq")).lower()
            expected = condition.get("value")
            actual = row.get(col)

            if op == "eq" and actual != expected:
                return False
            if op == "ne" and actual == expected:
                return False
            if op == "contains" and expected is not None and str(expected).lower() not in str(actual).lower():
                return False
            if op == "in" and isinstance(expected, list) and actual not in expected:
                return False
            if op == "not_in" and isinstance(expected, list) and actual in expected:
                return False
            if op in {"gt", "gte", "lt", "lte"}:
                try:
                    actual_num = _parse_numeric(actual)
                    expected_num = _parse_numeric(expected)
                except ValueError:
                    return False

                if op == "gt" and not (actual_num > expected_num):
                    return False
                if op == "gte" and not (actual_num >= expected_num):
                    return False
                if op == "lt" and not (actual_num < expected_num):
                    return False
                if op == "lte" and not (actual_num <= expected_num):
                    return False

        return True

    return [row for row in rows if _matches(row)]


def _apply_derive(rows: list[dict[str, Any]], config: dict[str, Any]) -> list[dict[str, Any]]:
    target_col = config.get("target_column")
    expr = str(config.get("expression", "concat")).lower()
    columns = config.get("columns") or []
    separator = str(config.get("separator", " "))

    if not target_col:
        return rows

    for row in rows:
        if expr == "copy" and columns:
            row[target_col] = row.get(columns[0])
            continue

        if expr == "coalesce" and columns:
            value = None
            for col in columns:
                candidate = row.get(col)
                if not _is_blank(candidate):
                    value = candidate
                    break
            row[target_col] = value
            continue

        values = [str(row.get(col)).strip() for col in columns if not _is_blank(row.get(col))]
        row[target_col] = separator.join(values) if values else None

    return rows


def _apply_rename(rows: list[dict[str, Any]], config: dict[str, Any]) -> list[dict[str, Any]]:
    from_col = config.get("from")
    to_col = config.get("to")
    if not from_col or not to_col:
        return rows

    for row in rows:
        row[to_col] = row.pop(from_col, None)
    return rows


def _apply_lookup(rows: list[dict[str, Any]], config: dict[str, Any]) -> list[dict[str, Any]]:
    source_col = config.get("column")
    target_col = config.get("target_column") or source_col
    mapping = config.get("map") or {}

    if not source_col or not isinstance(mapping, dict):
        return rows

    for row in rows:
        source_val = row.get(source_col)
        if source_val is None:
            continue
        direct = mapping.get(str(source_val))
        lowered = mapping.get(str(source_val).lower())
        row[target_col] = direct if direct is not None else lowered if lowered is not None else row.get(target_col)
    return rows


def _apply_join(rows: list[dict[str, Any]], config: dict[str, Any]) -> list[dict[str, Any]]:
    left_col = config.get("left_column")
    mapping = config.get("map") or {}
    field_map = config.get("fields") or {}

    if not left_col or not isinstance(mapping, dict) or not isinstance(field_map, dict):
        return rows

    for row in rows:
        left_val = row.get(left_col)
        joined = mapping.get(str(left_val)) if left_val is not None else None
        if not isinstance(joined, dict):
            continue
        for out_col, join_field in field_map.items():
            row[out_col] = joined.get(join_field)

    return rows


def _apply_cast_step(rows: list[dict[str, Any]], config: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    column = config.get("column")
    cast_type = config.get("type")
    if not column or not cast_type:
        return rows, []

    errors: list[dict[str, Any]] = []
    for row in rows:
        value = row.get(column)
        row_number = int(row.get("_row_number", 0) or 0)
        if _is_blank(value):
            continue
        try:
            row[column] = _cast_value(value, str(cast_type))
        except (ValueError, InvalidOperation) as exc:
            row[column] = None
            errors.append(
                {
                    "row_number": row_number,
                    "column_name": column,
                    "error_code": "transform_cast_error",
                    "message": str(exc),
                    "raw_value": str(value),
                }
            )

    return rows, errors


def _apply_pivot(rows: list[dict[str, Any]], config: dict[str, Any]) -> list[dict[str, Any]]:
    index_cols = config.get("index") or []
    pivot_col = config.get("pivot_column")
    value_col = config.get("value_column")

    if not index_cols or not pivot_col or not value_col:
        return rows

    grouped: dict[tuple[Any, ...], dict[str, Any]] = {}
    for row in rows:
        key = tuple(row.get(col) for col in index_cols)
        out = grouped.setdefault(key, {col: row.get(col) for col in index_cols})
        out["_row_number"] = out.get("_row_number") or row.get("_row_number")
        pivot_name = row.get(pivot_col)
        if _is_blank(pivot_name):
            continue
        out[str(pivot_name)] = row.get(value_col)

    return list(grouped.values())


def _apply_unpivot(rows: list[dict[str, Any]], config: dict[str, Any]) -> list[dict[str, Any]]:
    id_columns = config.get("id_columns") or []
    value_columns = config.get("value_columns") or []
    name_column = config.get("name_column", "metric")
    value_column = config.get("value_column", "value")

    if not value_columns:
        return rows

    out_rows: list[dict[str, Any]] = []
    for row in rows:
        base = {col: row.get(col) for col in id_columns}
        base["_row_number"] = row.get("_row_number")
        for col in value_columns:
            next_row = dict(base)
            next_row[name_column] = col
            next_row[value_column] = row.get(col)
            out_rows.append(next_row)

    return out_rows


def _apply_transform_steps(rows: list[dict[str, Any]], steps: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    ordered_steps = sorted(steps, key=lambda s: int(s.get("step_order", 0)))
    current_rows = [dict(row) for row in rows]
    errors: list[dict[str, Any]] = []

    for step in ordered_steps:
        step_type = str(step.get("step_type", "")).lower().strip()
        config = step.get("config_json") or {}

        if step_type == "filter":
            current_rows = _apply_filter(current_rows, config)
        elif step_type == "derive":
            current_rows = _apply_derive(current_rows, config)
        elif step_type == "rename":
            current_rows = _apply_rename(current_rows, config)
        elif step_type == "lookup":
            current_rows = _apply_lookup(current_rows, config)
        elif step_type == "join":
            current_rows = _apply_join(current_rows, config)
        elif step_type == "cast":
            current_rows, cast_errors = _apply_cast_step(current_rows, config)
            errors.extend(cast_errors)
        elif step_type == "pivot":
            current_rows = _apply_pivot(current_rows, config)
        elif step_type == "unpivot":
            current_rows = _apply_unpivot(current_rows, config)

    return current_rows, errors


def _required_fields_from_recipe(mappings: list[dict[str, Any]], target_schema: dict[str, Any]) -> set[str]:
    required_fields = {
        str(m.get("target_column"))
        for m in mappings
        if bool(m.get("required")) and m.get("target_column")
    }

    for column in target_schema.get("columns", []):
        if column.get("required"):
            required_fields.add(str(column["name"]))

    return required_fields


def _validate_target_specific(target_table_key: str, row: dict[str, Any]) -> list[tuple[str, str, str, Any]]:
    errs: list[tuple[str, str, str, Any]] = []

    if target_table_key == "vendor":
        name = row.get("name")
        if _is_blank(name):
            errs.append(("name", "vendor_name_required", "Vendor name is required", name))

        tax_id = row.get("tax_id")
        if not _is_blank(tax_id):
            if not re.match(r"^\d{2}-?\d{7}$", str(tax_id).strip()):
                errs.append(("tax_id", "vendor_tax_id_invalid", "taxId must be EIN-like (NN-NNNNNNN)", tax_id))

        terms = row.get("payment_terms")
        if not _is_blank(terms):
            allowed = {"net15", "net30", "net45", "net60", "due_on_receipt", "eom"}
            normalized = str(terms).strip().lower().replace(" ", "_")
            if normalized not in allowed:
                errs.append(
                    (
                        "payment_terms",
                        "vendor_payment_terms_invalid",
                        "paymentTerms must be one of net15/net30/net45/net60/due_on_receipt/eom",
                        terms,
                    )
                )

    if target_table_key == "trial_balance":
        if _is_blank(row.get("account")):
            errs.append(("account", "trial_balance_account_required", "account is required", row.get("account")))
        if _is_blank(row.get("period")):
            errs.append(("period", "trial_balance_period_required", "period is required", row.get("period")))
        if _is_blank(row.get("ending_balance")):
            errs.append(
                (
                    "ending_balance",
                    "trial_balance_ending_balance_required",
                    "ending balance is required",
                    row.get("ending_balance"),
                )
            )

    if target_table_key == "gl_transaction":
        if _is_blank(row.get("txn_date")):
            errs.append(("txn_date", "gl_date_required", "date is required", row.get("txn_date")))
        if _is_blank(row.get("account")):
            errs.append(("account", "gl_account_required", "account is required", row.get("account")))
        if _is_blank(row.get("amount")):
            errs.append(("amount", "gl_amount_required", "amount is required", row.get("amount")))

    if target_table_key == "cashflow_event":
        if _is_blank(row.get("event_date")):
            errs.append(("event_date", "cashflow_date_required", "date is required", row.get("event_date")))
        if _is_blank(row.get("amount")):
            errs.append(("amount", "cashflow_amount_required", "amount is required", row.get("amount")))
        event_type = row.get("event_type")
        if _is_blank(event_type):
            errs.append(("event_type", "cashflow_event_type_required", "event_type is required", event_type))
        else:
            allowed_types = {
                "capital_call",
                "operating_cf",
                "capex",
                "debt_service",
                "refinance_proceeds",
                "sale_proceeds",
                "fee",
                "distribution",
                "other",
            }
            if str(event_type).strip().lower() not in allowed_types:
                errs.append(("event_type", "cashflow_event_type_invalid", "event_type is not in allowed enum", event_type))

    return errs


def _apply_validation_rules(
    row: dict[str, Any],
    rules: list[dict[str, Any]],
) -> list[tuple[str | None, str, str, Any]]:
    errors: list[tuple[str | None, str, str, Any]] = []

    for rule in rules:
        rule_type = str(rule.get("type", "")).lower().strip()
        column = rule.get("column")
        value = row.get(column) if column else None

        if rule_type == "required":
            if _is_blank(value):
                errors.append((column, "required", f"{column} is required", value))

        elif rule_type == "range" and not _is_blank(value):
            try:
                numeric = _parse_numeric(value)
            except ValueError:
                errors.append((column, "range_type_error", f"{column} must be numeric", value))
                continue

            min_v = rule.get("min")
            max_v = rule.get("max")
            if min_v is not None and numeric < float(min_v):
                errors.append((column, "range_min", f"{column} must be >= {min_v}", value))
            if max_v is not None and numeric > float(max_v):
                errors.append((column, "range_max", f"{column} must be <= {max_v}", value))

        elif rule_type == "enum" and not _is_blank(value):
            allowed = rule.get("allowed") or []
            if str(value) not in [str(item) for item in allowed]:
                errors.append((column, "enum", f"{column} must be one of {allowed}", value))

        elif rule_type == "regex" and not _is_blank(value):
            pattern = str(rule.get("pattern", ""))
            if pattern and not re.search(pattern, str(value)):
                errors.append((column, "regex", f"{column} does not match expected format", value))

        elif rule_type == "reference" and not _is_blank(value):
            reference_sets = rule.get("reference_set") or []
            normalized = {str(item).strip().lower() for item in reference_sets}
            if str(value).strip().lower() not in normalized:
                errors.append((column, "reference", f"{column} value not present in reference set", value))

    return errors


def _natural_key_for_row(row: dict[str, Any], key_fields: list[str]) -> str | None:
    if not key_fields:
        return None

    parts: list[str] = []
    for field in key_fields:
        value = row.get(field)
        if _is_blank(value):
            return None
        parts.append(str(value).strip().lower())

    return "|".join(parts)


def _validate_rows(
    rows: list[dict[str, Any]],
    mappings: list[dict[str, Any]],
    target_schema: dict[str, Any],
    target_table_key: str,
    primary_key_fields: list[str],
    settings: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    pre_valid_rows: list[dict[str, Any]] = []

    required_fields = _required_fields_from_recipe(mappings, target_schema)
    schema_columns = {str(c["name"]): str(c.get("type", "string")) for c in target_schema.get("columns", [])}
    validation_rules = settings.get("validation_rules") or []

    for idx, row in enumerate(rows):
        row_number = int(row.get("_row_number", idx + 1) or idx + 1)
        row_has_error = False

        for field in required_fields:
            value = row.get(field)
            if _is_blank(value):
                errors.append(
                    {
                        "row_number": row_number,
                        "column_name": field,
                        "error_code": "required",
                        "message": f"{field} is required",
                        "raw_value": None if value is None else str(value),
                    }
                )
                row_has_error = True

        for column, type_name in schema_columns.items():
            value = row.get(column)
            if _is_blank(value):
                continue
            try:
                casted = _cast_value(value, type_name)
                row[column] = casted
            except (ValueError, InvalidOperation) as exc:
                errors.append(
                    {
                        "row_number": row_number,
                        "column_name": column,
                        "error_code": "type_cast_error",
                        "message": str(exc),
                        "raw_value": str(value),
                    }
                )
                row_has_error = True

        for col, code, msg, raw in _validate_target_specific(target_table_key, row):
            errors.append(
                {
                    "row_number": row_number,
                    "column_name": col,
                    "error_code": code,
                    "message": msg,
                    "raw_value": None if raw is None else str(raw),
                }
            )
            row_has_error = True

        for col, code, msg, raw in _apply_validation_rules(row, validation_rules):
            errors.append(
                {
                    "row_number": row_number,
                    "column_name": col,
                    "error_code": code,
                    "message": msg,
                    "raw_value": None if raw is None else str(raw),
                }
            )
            row_has_error = True

        if not row_has_error:
            pre_valid_rows.append(row)

    if primary_key_fields:
        deduped_rows: list[dict[str, Any]] = []
        seen: dict[str, int] = {}
        for row in pre_valid_rows:
            row_number = int(row.get("_row_number", 0) or 0)
            key = _natural_key_for_row(row, primary_key_fields)
            if key is None:
                errors.append(
                    {
                        "row_number": row_number,
                        "column_name": ",".join(primary_key_fields),
                        "error_code": "missing_key",
                        "message": "Primary key fields must all be present",
                        "raw_value": None,
                    }
                )
                continue

            if key in seen:
                errors.append(
                    {
                        "row_number": row_number,
                        "column_name": ",".join(primary_key_fields),
                        "error_code": "duplicate_key",
                        "message": f"Duplicate key in batch: {key}",
                        "raw_value": key,
                    }
                )
                continue

            seen[key] = row_number
            row["_natural_key"] = key
            deduped_rows.append(row)

        return deduped_rows, errors

    return pre_valid_rows, errors


def run_pipeline(
    *,
    raw_bytes: bytes,
    file_type: str,
    recipe: dict[str, Any],
    mappings: list[dict[str, Any]],
    transform_steps: list[dict[str, Any]],
    preview_rows: int = DEFAULT_PREVIEW_ROWS,
) -> dict[str, Any]:
    settings = recipe.get("settings_json") or {}
    target_table_key = str(recipe.get("target_table_key", "custom"))
    primary_key_fields = [str(v) for v in (recipe.get("primary_key_fields") or [])]

    extract = _extract_records_for_recipe(raw_bytes, file_type=file_type, settings=settings)
    raw_records = extract["records"]

    mapped_rows, mapping_errors = _apply_mappings(raw_records, mappings)
    transformed_rows, step_errors = _apply_transform_steps(mapped_rows, transform_steps)

    target_schema = get_target_schema(target_table_key)
    valid_rows, validation_errors = _validate_rows(
        transformed_rows,
        mappings,
        target_schema,
        target_table_key,
        primary_key_fields,
        settings,
    )

    all_errors = [*mapping_errors, *step_errors, *validation_errors]

    preview = []
    for row in valid_rows[:preview_rows]:
        preview.append({k: v for k, v in row.items() if not k.startswith("_")})

    lineage = {
        "parser": {
            "file_type": file_type,
            "sheet_name": extract.get("sheet_name"),
            "header_row_index": extract.get("header_row_index"),
            "settings": settings,
        },
        "mapping": {
            "mapped_columns": [
                {
                    "source_column": m.get("source_column"),
                    "target_column": m.get("target_column"),
                    "required": bool(m.get("required")),
                }
                for m in sorted(mappings, key=lambda x: int(x.get("mapping_order", 0)))
            ],
            "primary_key_fields": primary_key_fields,
        },
        "transform_steps": [
            {
                "step_order": int(step.get("step_order", 0)),
                "step_type": step.get("step_type"),
                "config_json": step.get("config_json") or {},
            }
            for step in sorted(transform_steps, key=lambda s: int(s.get("step_order", 0)))
        ],
        "target": {
            "table_key": target_table_key,
            "schema_columns": target_schema.get("columns", []),
        },
    }

    return {
        "rows_read": len(raw_records),
        "rows_valid": len(valid_rows),
        "rows_rejected": len(all_errors),
        "preview_rows": preview,
        "valid_rows": valid_rows,
        "errors": all_errors,
        "lineage": lineage,
        "sheet_name": extract.get("sheet_name"),
        "header_row_index": extract.get("header_row_index"),
    }


__all__ = [
    "ENGINE_VERSION",
    "TARGET_SCHEMAS",
    "compute_run_hash",
    "get_target_schema",
    "list_stock_targets",
    "profile_file",
    "run_pipeline",
]
