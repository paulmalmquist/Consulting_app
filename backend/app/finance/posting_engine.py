"""Deterministic journal posting for finance events."""

from __future__ import annotations

from datetime import date
from typing import Any

from .utils import qmoney


def post_batch(
    cur,
    *,
    tenant_id: str,
    business_id: str,
    partition_id: str,
    posting_date: date,
    source_type: str,
    source_id: str,
    idempotency_key: str,
    memo: str,
    lines: list[dict[str, Any]],
    fin_run_id: str | None = None,
) -> dict:
    cur.execute(
        """SELECT fin_posting_batch_id
           FROM fin_posting_batch
           WHERE tenant_id = %s
             AND business_id = %s
             AND partition_id = %s
             AND idempotency_key = %s""",
        (tenant_id, business_id, partition_id, idempotency_key),
    )
    existing = cur.fetchone()
    if existing:
        return {
            "fin_posting_batch_id": existing["fin_posting_batch_id"],
            "fin_journal_entry_id": None,
            "idempotent": True,
        }

    cur.execute(
        """INSERT INTO fin_posting_batch
           (tenant_id, business_id, partition_id, posting_date, source_type, source_id, idempotency_key, status, fin_run_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, 'posted', %s)
           RETURNING fin_posting_batch_id""",
        (
            tenant_id,
            business_id,
            partition_id,
            posting_date,
            source_type,
            source_id,
            idempotency_key,
            fin_run_id,
        ),
    )
    batch_id = cur.fetchone()["fin_posting_batch_id"]

    cur.execute(
        """INSERT INTO fin_journal_entry
           (tenant_id, business_id, partition_id, fin_posting_batch_id, entry_date, reference, memo, status)
           VALUES (%s, %s, %s, %s, %s, %s, %s, 'posted')
           RETURNING fin_journal_entry_id""",
        (
            tenant_id,
            business_id,
            partition_id,
            batch_id,
            posting_date,
            f"{source_type}:{source_id}",
            memo,
        ),
    )
    entry_id = cur.fetchone()["fin_journal_entry_id"]

    for idx, line in enumerate(lines, start=1):
        cur.execute(
            """INSERT INTO fin_journal_line
               (tenant_id, business_id, partition_id, fin_journal_entry_id, line_number,
                gl_account_code, debit, credit, currency_code, fin_entity_id, fin_participant_id, memo)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                tenant_id,
                business_id,
                partition_id,
                entry_id,
                idx,
                line["gl_account_code"],
                qmoney(line.get("debit", 0)),
                qmoney(line.get("credit", 0)),
                line.get("currency_code", "USD"),
                line.get("fin_entity_id"),
                line.get("fin_participant_id"),
                line.get("memo"),
            ),
        )

    cur.execute(
        """INSERT INTO fin_source_link
           (tenant_id, business_id, partition_id, source_table, source_id, fin_journal_entry_id, fin_run_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (
            tenant_id,
            business_id,
            partition_id,
            source_type,
            source_id,
            entry_id,
            fin_run_id,
        ),
    )

    return {
        "fin_posting_batch_id": batch_id,
        "fin_journal_entry_id": entry_id,
        "idempotent": False,
    }
