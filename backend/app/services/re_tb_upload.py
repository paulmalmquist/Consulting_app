"""Trial balance upload: parse, auto-map, validate, and commit.

Handles CSV/Excel file parsing, automatic GL account mapping using
existing mapping rules, TB balance validation, and commit to the
accounting pipeline (acct_gl_balance_monthly → normalization).

Depends on: re_accounting.import_accounting()
"""
from __future__ import annotations

import csv
import hashlib
import io

from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.re_accounting import import_accounting


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

# Canonical column name patterns (case-insensitive)
_COL_PATTERNS: dict[str, list[str]] = {
    "account_code": ["account code", "account no", "account number", "acct", "acct no", "gl account", "gl code", "account #"],
    "account_name": ["account name", "description", "account desc", "name", "account description"],
    "debit": ["debit", "dr"],
    "credit": ["credit", "cr"],
    "balance": ["balance", "net", "amount", "ending balance", "net amount"],
}


def _match_column(header: str) -> str | None:
    """Match a raw header to a canonical column name."""
    h = header.strip().lower()
    for canon, patterns in _COL_PATTERNS.items():
        for p in patterns:
            if h == p or h.replace("_", " ") == p:
                return canon
    return None


def _parse_number(val: Any) -> Decimal | None:
    """Parse a numeric value, handling commas, parens for negatives, etc."""
    if val is None:
        return None
    s = str(val).strip()
    if not s or s in ("", "-", "—", "–", "N/A", "n/a"):
        return None
    # Handle parenthetical negatives: (1,234.56) → -1234.56
    neg = False
    if s.startswith("(") and s.endswith(")"):
        s = s[1:-1]
        neg = True
    # Remove $ and commas
    s = s.replace("$", "").replace(",", "").strip()
    if not s:
        return None
    try:
        d = Decimal(s)
        return -d if neg else d
    except InvalidOperation:
        return None


def parse_csv(file_bytes: bytes) -> list[dict]:
    """Parse a CSV trial balance file.

    Returns list of dicts with keys:
      row_num, raw_account_code, raw_account_name, raw_debit, raw_credit, raw_balance
    """
    text = file_bytes.decode("utf-8-sig")  # handle BOM
    reader = csv.reader(io.StringIO(text))

    # Find header row — first row where ≥2 columns match known patterns
    header_row = None
    header_idx = 0
    for i, row in enumerate(reader):
        matches = sum(1 for cell in row if _match_column(cell))
        if matches >= 2:
            header_row = row
            header_idx = i
            break

    if not header_row:
        raise ValueError("Could not detect header row. Expected columns like 'Account Code', 'Debit', 'Credit', 'Balance'.")

    # Map header positions
    col_map: dict[str, int] = {}
    for j, cell in enumerate(header_row):
        canon = _match_column(cell)
        if canon and canon not in col_map:
            col_map[canon] = j

    if "account_code" not in col_map and "account_name" not in col_map:
        raise ValueError("Could not find an account code or account name column.")

    if "balance" not in col_map and "debit" not in col_map:
        raise ValueError("Could not find balance, debit, or credit columns.")

    # Parse data rows
    rows: list[dict] = []
    # Re-read from the beginning since csv.reader is consumed
    reader2 = csv.reader(io.StringIO(text))
    for i, row in enumerate(reader2):
        if i <= header_idx:
            continue
        if not any(cell.strip() for cell in row):
            continue  # skip blank rows

        acct_code = row[col_map["account_code"]].strip() if "account_code" in col_map and col_map["account_code"] < len(row) else None
        acct_name = row[col_map["account_name"]].strip() if "account_name" in col_map and col_map["account_name"] < len(row) else None

        debit = _parse_number(row[col_map["debit"]]) if "debit" in col_map and col_map["debit"] < len(row) else None
        credit = _parse_number(row[col_map["credit"]]) if "credit" in col_map and col_map["credit"] < len(row) else None
        balance = _parse_number(row[col_map["balance"]]) if "balance" in col_map and col_map["balance"] < len(row) else None

        # Skip rows with no account identifier and no amounts
        if not acct_code and not acct_name:
            continue
        if debit is None and credit is None and balance is None:
            continue

        rows.append({
            "row_num": len(rows) + 1,
            "raw_account_code": acct_code,
            "raw_account_name": acct_name,
            "raw_debit": debit,
            "raw_credit": credit,
            "raw_balance": balance,
        })

    return rows


def parse_excel(file_bytes: bytes) -> list[dict]:
    """Parse an Excel trial balance file (.xlsx/.xls)."""
    try:
        import openpyxl
    except ImportError:
        raise ValueError("Excel parsing requires openpyxl. Install with: pip install openpyxl")

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active
    if ws is None:
        raise ValueError("Workbook has no active sheet.")

    # Read all rows
    all_rows = list(ws.iter_rows(values_only=True))
    wb.close()

    # Find header row
    header_row = None
    header_idx = 0
    for i, row in enumerate(all_rows):
        matches = sum(1 for cell in row if cell and _match_column(str(cell)))
        if matches >= 2:
            header_row = row
            header_idx = i
            break

    if not header_row:
        raise ValueError("Could not detect header row in Excel file.")

    # Map header positions
    col_map: dict[str, int] = {}
    for j, cell in enumerate(header_row):
        if cell:
            canon = _match_column(str(cell))
            if canon and canon not in col_map:
                col_map[canon] = j

    if "account_code" not in col_map and "account_name" not in col_map:
        raise ValueError("Could not find an account code or account name column.")

    if "balance" not in col_map and "debit" not in col_map:
        raise ValueError("Could not find balance, debit, or credit columns.")

    # Parse data rows
    rows: list[dict] = []
    for i in range(header_idx + 1, len(all_rows)):
        row = all_rows[i]
        if not any(cell is not None and str(cell).strip() for cell in row):
            continue

        def _cell(key: str) -> Any:
            if key in col_map and col_map[key] < len(row):
                return row[col_map[key]]
            return None

        acct_code = str(_cell("account_code") or "").strip() or None
        acct_name = str(_cell("account_name") or "").strip() or None
        debit = _parse_number(_cell("debit"))
        credit = _parse_number(_cell("credit"))
        balance = _parse_number(_cell("balance"))

        if not acct_code and not acct_name:
            continue
        if debit is None and credit is None and balance is None:
            continue

        rows.append({
            "row_num": len(rows) + 1,
            "raw_account_code": acct_code,
            "raw_account_name": acct_name,
            "raw_debit": debit,
            "raw_credit": credit,
            "raw_balance": balance,
        })

    return rows


# ---------------------------------------------------------------------------
# Auto-mapping
# ---------------------------------------------------------------------------

def auto_map_accounts(
    rows: list[dict],
    *,
    env_id: str,
    business_id: UUID,
    template_id: UUID | None = None,
) -> list[dict]:
    """Annotate parsed rows with mapped GL accounts using existing mapping rules.

    Returns the same rows list with `mapped_gl_account` and `mapping_confidence` set.
    """
    # Load existing mapping rules and chart of accounts
    with get_cursor() as cur:
        cur.execute(
            "SELECT gl_account, name FROM acct_chart_of_accounts"
        )
        coa = {r["gl_account"]: r["name"] for r in cur.fetchall()}

        cur.execute(
            "SELECT gl_account, target_line_code FROM acct_mapping_rule "
            "WHERE env_id = %s AND business_id = %s",
            (env_id, str(business_id)),
        )
        rules = {r["gl_account"]: r["target_line_code"] for r in cur.fetchall()}

        # Load template mappings if provided
        template_map: dict[str, str] = {}
        if template_id:
            cur.execute(
                "SELECT mappings FROM acct_mapping_template WHERE id = %s",
                (str(template_id),),
            )
            tmpl = cur.fetchone()
            if tmpl and tmpl["mappings"]:
                for m in tmpl["mappings"]:
                    template_map[m.get("raw_account_code", "")] = m.get("mapped_gl_account", "")

    for row in rows:
        code = row.get("raw_account_code") or ""
        name = (row.get("raw_account_name") or "").lower()

        # Priority 1: Template mapping (exact match)
        if code in template_map:
            row["mapped_gl_account"] = template_map[code]
            row["mapping_confidence"] = 1.0
            continue

        # Priority 2: Mapping rule match (GL → target line code)
        if code in rules:
            row["mapped_gl_account"] = code
            row["mapping_confidence"] = 0.95
            continue

        # Priority 3: Exact GL code match in chart of accounts
        if code in coa:
            row["mapped_gl_account"] = code
            row["mapping_confidence"] = 1.0
            continue

        # Priority 3: Name-based fuzzy match against chart of accounts
        best_match = None
        best_score = 0.0
        for gl_code, gl_name in coa.items():
            gl_lower = gl_name.lower()
            # Simple substring match scoring
            if name and gl_lower and (name in gl_lower or gl_lower in name):
                score = 0.7
                if name == gl_lower:
                    score = 0.95
                if score > best_score:
                    best_score = score
                    best_match = gl_code

        if best_match and best_score >= 0.7:
            row["mapped_gl_account"] = best_match
            row["mapping_confidence"] = best_score
        else:
            row["mapped_gl_account"] = None
            row["mapping_confidence"] = 0.0

    return rows


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_tb(rows: list[dict]) -> dict:
    """Validate a parsed trial balance.

    Returns {valid: bool, errors: list[str], warnings: list[str], summary: dict}
    """
    errors: list[str] = []
    warnings: list[str] = []

    if not rows:
        errors.append("No data rows found in file.")
        return {"valid": False, "errors": errors, "warnings": warnings, "summary": {}}

    # 1. Check debit/credit balance
    total_debit = Decimal(0)
    total_credit = Decimal(0)
    total_balance = Decimal(0)
    has_dr_cr = any(r.get("raw_debit") is not None or r.get("raw_credit") is not None for r in rows)

    for r in rows:
        if r.get("raw_debit") is not None:
            total_debit += r["raw_debit"]
        if r.get("raw_credit") is not None:
            total_credit += r["raw_credit"]
        if r.get("raw_balance") is not None:
            total_balance += r["raw_balance"]

    if has_dr_cr:
        diff = abs(total_debit - total_credit)
        if diff > Decimal("0.01"):
            errors.append(f"Trial balance does not balance: Debits={total_debit:,.2f}, Credits={total_credit:,.2f}, Difference={diff:,.2f}")
        elif diff > 0:
            warnings.append(f"Minor rounding difference: {diff:,.4f}")

    # 2. Check for duplicate account codes
    codes = [r["raw_account_code"] for r in rows if r.get("raw_account_code")]
    dupes = [c for c in set(codes) if codes.count(c) > 1]
    if dupes:
        warnings.append(f"Duplicate account codes found: {', '.join(sorted(dupes))}")

    # 3. Check for unmapped accounts
    unmapped = [r for r in rows if not r.get("mapped_gl_account")]
    if unmapped:
        unmapped_codes = [r.get("raw_account_code") or f"row {r['row_num']}" for r in unmapped]
        if len(unmapped_codes) <= 10:
            warnings.append(f"Unmapped accounts ({len(unmapped)}): {', '.join(unmapped_codes)}")
        else:
            warnings.append(f"{len(unmapped)} unmapped accounts (first 10): {', '.join(unmapped_codes[:10])}")

    # 4. Check for suspicious sign reversals (revenue should be positive, expenses negative in balance)
    for r in rows:
        bal = r.get("raw_balance")
        code = r.get("mapped_gl_account") or ""
        if bal is not None and code:
            # Revenue accounts (4xxx) should typically have credit (positive) balances
            if code.startswith("4") and bal < 0:
                warnings.append(f"Revenue account {code} has negative balance ({bal})")
            # Expense accounts (5xxx, 6xxx) should typically have debit balances
            if code.startswith(("5", "6")) and bal < 0:
                warnings.append(f"Expense account {code} has negative balance ({bal})")

    summary = {
        "row_count": len(rows),
        "total_debit": float(total_debit),
        "total_credit": float(total_credit),
        "total_balance": float(total_balance),
        "mapped_count": len(rows) - len(unmapped),
        "unmapped_count": len(unmapped),
        "duplicate_codes": dupes,
    }

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Batch persistence
# ---------------------------------------------------------------------------

def create_batch(
    *,
    env_id: str,
    business_id: UUID,
    asset_id: UUID | None,
    period_month: str,
    filename: str,
    file_bytes: bytes,
    rows: list[dict],
    uploaded_by: str | None = None,
    mapping_template_id: UUID | None = None,
) -> dict:
    """Create an upload batch with parsed rows in the database."""
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    with get_cursor() as cur:
        # Check for existing batch with same file hash
        cur.execute(
            "SELECT id, status FROM acct_upload_batch "
            "WHERE env_id = %s AND business_id = %s AND file_hash = %s",
            (env_id, str(business_id), file_hash),
        )
        existing = cur.fetchone()
        if existing:
            return {
                "batch_id": str(existing["id"]),
                "status": existing["status"],
                "duplicate": True,
                "message": f"This file was already uploaded (batch {existing['id']}, status: {existing['status']})",
            }

        # Check for existing batch for same asset/period — mark as superseded
        supersedes_id = None
        if asset_id:
            cur.execute(
                "SELECT id FROM acct_upload_batch "
                "WHERE env_id = %s AND business_id = %s AND asset_id = %s "
                "AND period_month = %s AND status IN ('committed') "
                "ORDER BY created_at DESC LIMIT 1",
                (env_id, str(business_id), str(asset_id), period_month),
            )
            prev = cur.fetchone()
            if prev:
                supersedes_id = prev["id"]

        # Insert batch
        cur.execute(
            """
            INSERT INTO acct_upload_batch
                (env_id, business_id, asset_id, period_month, filename, file_hash,
                 file_size_bytes, row_count, status, mapping_template_id,
                 supersedes_batch_id, uploaded_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s, %s)
            RETURNING id
            """,
            (
                env_id, str(business_id), str(asset_id) if asset_id else None,
                period_month, filename, file_hash, len(file_bytes), len(rows),
                str(mapping_template_id) if mapping_template_id else None,
                str(supersedes_id) if supersedes_id else None,
                uploaded_by,
            ),
        )
        batch_id = cur.fetchone()["id"]

        # Insert parsed rows
        for row in rows:
            cur.execute(
                """
                INSERT INTO acct_upload_row
                    (batch_id, row_num, raw_account_code, raw_account_name,
                     raw_debit, raw_credit, raw_balance,
                     mapped_gl_account, mapping_confidence)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(batch_id), row["row_num"],
                    row.get("raw_account_code"), row.get("raw_account_name"),
                    row.get("raw_debit"), row.get("raw_credit"), row.get("raw_balance"),
                    row.get("mapped_gl_account"), row.get("mapping_confidence", 0),
                ),
            )

    emit_log(
        level="info",
        service="backend",
        action="re.tb_upload.create_batch",
        message=f"TB batch created: {len(rows)} rows from {filename}",
        context={"env_id": env_id, "batch_id": str(batch_id), "filename": filename},
    )

    return {
        "batch_id": str(batch_id),
        "status": "pending",
        "duplicate": False,
        "row_count": len(rows),
        "supersedes": str(supersedes_id) if supersedes_id else None,
    }


def update_mappings(
    *,
    batch_id: UUID,
    mappings: list[dict],
) -> dict:
    """Update mapped GL accounts for rows in a batch.

    mappings: [{"row_num": 1, "mapped_gl_account": "4000"}, ...]
    """
    updated = 0
    with get_cursor() as cur:
        for m in mappings:
            cur.execute(
                """
                UPDATE acct_upload_row
                SET mapped_gl_account = %s, mapping_confidence = 1.0
                WHERE batch_id = %s AND row_num = %s
                """,
                (m["mapped_gl_account"], str(batch_id), m["row_num"]),
            )
            updated += cur.rowcount

        # Update batch status to 'mapped'
        cur.execute(
            "UPDATE acct_upload_batch SET status = 'mapped' WHERE id = %s",
            (str(batch_id),),
        )

    return {"updated": updated}


def save_mapping_template(
    *,
    env_id: str,
    business_id: UUID,
    batch_id: UUID,
    name: str,
    created_by: str | None = None,
) -> dict:
    """Save the current batch mappings as a reusable template."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT raw_account_code, raw_account_name, mapped_gl_account
            FROM acct_upload_row
            WHERE batch_id = %s AND mapped_gl_account IS NOT NULL
            ORDER BY row_num
            """,
            (str(batch_id),),
        )
        mappings = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            INSERT INTO acct_mapping_template
                (env_id, business_id, name, mappings, source_count, created_by)
            VALUES (%s, %s, %s, %s::jsonb, %s, %s)
            RETURNING id
            """,
            (
                env_id, str(business_id), name,
                __import__("json").dumps(mappings, default=str),
                len(mappings), created_by,
            ),
        )
        template_id = cur.fetchone()["id"]

    return {"template_id": str(template_id), "mapping_count": len(mappings)}


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------

def commit_batch(
    *,
    batch_id: UUID,
    env_id: str,
    business_id: UUID,
) -> dict:
    """Commit a validated batch to the accounting pipeline.

    1. Reads mapped rows from acct_upload_row
    2. Writes to acct_gl_balance_monthly via import_accounting()
    3. Updates batch status to 'committed'
    4. Marks superseded batch if applicable
    """
    with get_cursor() as cur:
        # Load batch
        cur.execute(
            "SELECT * FROM acct_upload_batch WHERE id = %s",
            (str(batch_id),),
        )
        batch = cur.fetchone()
        if not batch:
            raise ValueError(f"Batch {batch_id} not found")
        if batch["status"] == "committed":
            return {"status": "already_committed", "batch_id": str(batch_id)}
        if batch["status"] == "failed":
            raise ValueError(f"Batch {batch_id} is in failed state")

        # Load rows
        cur.execute(
            """
            SELECT row_num, raw_account_code, raw_debit, raw_credit, raw_balance,
                   mapped_gl_account
            FROM acct_upload_row
            WHERE batch_id = %s AND mapped_gl_account IS NOT NULL
            ORDER BY row_num
            """,
            (str(batch_id),),
        )
        rows = cur.fetchall()

    if not rows:
        raise ValueError("No mapped rows to commit. Map accounts first.")

    # Build payload for import_accounting
    asset_id = batch["asset_id"]
    period_month = str(batch["period_month"])
    source_name = f"tb_upload_{batch_id}"

    payload: list[dict] = []
    for r in rows:
        # Compute balance: prefer explicit balance, else debit - credit
        balance = r["raw_balance"]
        if balance is None:
            debit = r["raw_debit"] or Decimal(0)
            credit = r["raw_credit"] or Decimal(0)
            balance = debit - credit

        payload.append({
            "asset_id": str(asset_id) if asset_id else None,
            "period_month": period_month,
            "gl_account": r["mapped_gl_account"],
            "amount": float(balance),
        })

    # Call existing import pipeline
    result = import_accounting(
        env_id=env_id,
        business_id=UUID(str(business_id)),
        source_name=source_name,
        payload=payload,
    )

    # Update batch status
    with get_cursor() as cur:
        cur.execute(
            "UPDATE acct_upload_batch SET status = 'committed', committed_at = now() WHERE id = %s",
            (str(batch_id),),
        )

        # Mark superseded batch
        if batch.get("supersedes_batch_id"):
            cur.execute(
                "UPDATE acct_upload_batch SET status = 'superseded' WHERE id = %s",
                (str(batch["supersedes_batch_id"]),),
            )

    emit_log(
        level="info",
        service="backend",
        action="re.tb_upload.commit",
        message=f"TB batch committed: {len(payload)} rows",
        context={
            "env_id": env_id,
            "batch_id": str(batch_id),
            "rows_loaded": result.get("rows_loaded", 0),
            "rows_normalized": result.get("rows_normalized", 0),
        },
    )

    return {
        "status": "committed",
        "batch_id": str(batch_id),
        "rows_committed": len(payload),
        "rows_loaded": result.get("rows_loaded", 0),
        "rows_normalized": result.get("rows_normalized", 0),
        "source_hash": result.get("source_hash"),
    }


def get_batch_rows(batch_id: UUID) -> list[dict]:
    """Get all rows for a batch."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT row_num, raw_account_code, raw_account_name,
                   raw_debit, raw_credit, raw_balance,
                   mapped_gl_account, mapping_confidence, validation_notes
            FROM acct_upload_row
            WHERE batch_id = %s
            ORDER BY row_num
            """,
            (str(batch_id),),
        )
        return [dict(r) for r in cur.fetchall()]


def list_batches(
    *,
    env_id: str,
    business_id: UUID,
    asset_id: UUID | None = None,
    limit: int = 50,
) -> list[dict]:
    """List upload batches for an environment, optionally filtered by asset."""
    with get_cursor() as cur:
        conditions = ["env_id = %s", "business_id = %s"]
        params: list[Any] = [env_id, str(business_id)]
        if asset_id:
            conditions.append("asset_id = %s")
            params.append(str(asset_id))
        params.append(limit)
        cur.execute(
            f"""
            SELECT id, asset_id, period_month, filename, file_hash, row_count,
                   status, uploaded_by, created_at, committed_at
            FROM acct_upload_batch
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC
            LIMIT %s
            """,
            params,
        )
        return [dict(r) for r in cur.fetchall()]
