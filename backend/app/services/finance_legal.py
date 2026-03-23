"""Legal finance domain service (matter economics + trust)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.finance.posting_engine import post_batch
from app.finance.trust_engine import compute_trust_balance
from app.finance.utils import qmoney
from app.services.finance_common import get_partition_context


def _get_matter(cur, matter_id: UUID) -> dict:
    cur.execute("SELECT * FROM fin_matter WHERE fin_matter_id = %s", (str(matter_id),))
    row = cur.fetchone()
    if not row:
        raise LookupError("Matter not found")
    return row


def create_matter(
    *,
    business_id: UUID,
    partition_id: UUID,
    matter_number: str,
    name: str,
    opened_at: date,
    contingency_fee_rate: Decimal | None,
    trust_required: bool,
    fin_entity_id_client: UUID | None = None,
    responsible_actor_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        ctx = get_partition_context(cur, business_id, partition_id)

        cur.execute(
            """INSERT INTO fin_matter
               (tenant_id, business_id, partition_id, matter_number, name,
                fin_entity_id_client, responsible_actor_id, contingency_fee_rate,
                trust_required, status, opened_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'open', %s)
               RETURNING *""",
            (
                ctx["tenant_id"],
                str(business_id),
                str(partition_id),
                matter_number,
                name,
                str(fin_entity_id_client) if fin_entity_id_client else None,
                str(responsible_actor_id) if responsible_actor_id else None,
                qmoney(contingency_fee_rate or 0),
                trust_required,
                opened_at,
            ),
        )
        matter = cur.fetchone()

        if trust_required:
            cur.execute(
                """INSERT INTO fin_trust_account
                   (tenant_id, business_id, partition_id, fin_matter_id, currency_code, status)
                   VALUES (%s, %s, %s, %s, 'USD', 'active')
                   ON CONFLICT (tenant_id, business_id, partition_id, fin_matter_id)
                   DO NOTHING""",
                (
                    matter["tenant_id"],
                    matter["business_id"],
                    matter["partition_id"],
                    matter["fin_matter_id"],
                ),
            )

        return matter


def list_matters(*, business_id: UUID, partition_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        get_partition_context(cur, business_id, partition_id)
        cur.execute(
            """SELECT *
               FROM fin_matter
               WHERE business_id = %s AND partition_id = %s
               ORDER BY created_at DESC""",
            (str(business_id), str(partition_id)),
        )
        return cur.fetchall()


def _ensure_trust_account(cur, matter: dict) -> str:
    cur.execute(
        """SELECT fin_trust_account_id
           FROM fin_trust_account
           WHERE fin_matter_id = %s AND partition_id = %s""",
        (matter["fin_matter_id"], matter["partition_id"]),
    )
    row = cur.fetchone()
    if row:
        return row["fin_trust_account_id"]

    cur.execute(
        """INSERT INTO fin_trust_account
           (tenant_id, business_id, partition_id, fin_matter_id, currency_code, status)
           VALUES (%s, %s, %s, %s, 'USD', 'active')
           RETURNING fin_trust_account_id""",
        (
            matter["tenant_id"],
            matter["business_id"],
            matter["partition_id"],
            matter["fin_matter_id"],
        ),
    )
    return cur.fetchone()["fin_trust_account_id"]


def create_trust_transaction(
    *,
    matter_id: UUID,
    txn_date: date,
    txn_type: str,
    direction: str,
    amount: Decimal,
    memo: str | None,
    fin_run_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        matter = _get_matter(cur, matter_id)
        trust_account_id = _ensure_trust_account(cur, matter)

        cur.execute(
            """INSERT INTO fin_trust_transaction
               (tenant_id, business_id, partition_id, fin_trust_account_id, fin_matter_id,
                txn_date, txn_type, direction, amount, memo)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                matter["tenant_id"],
                matter["business_id"],
                matter["partition_id"],
                trust_account_id,
                matter["fin_matter_id"],
                txn_date,
                txn_type,
                direction,
                qmoney(amount),
                memo,
            ),
        )
        txn = cur.fetchone()

        posting = post_batch(
            cur,
            tenant_id=str(matter["tenant_id"]),
            business_id=str(matter["business_id"]),
            partition_id=str(matter["partition_id"]),
            posting_date=txn_date,
            source_type="fin_trust_transaction",
            source_id=str(txn["fin_trust_transaction_id"]),
            idempotency_key=f"trust:{txn['fin_trust_transaction_id']}",
            memo=f"Trust transaction for matter {matter['matter_number']}",
            fin_run_id=str(fin_run_id) if fin_run_id else None,
            lines=[
                {
                    "gl_account_code": "TRUST_CASH",
                    "debit": qmoney(amount) if direction == "credit" else Decimal("0"),
                    "credit": qmoney(amount) if direction == "debit" else Decimal("0"),
                },
                {
                    "gl_account_code": "TRUST_LIABILITY",
                    "debit": qmoney(amount) if direction == "debit" else Decimal("0"),
                    "credit": qmoney(amount) if direction == "credit" else Decimal("0"),
                },
            ],
        )

        cur.execute(
            "UPDATE fin_trust_transaction SET fin_posting_batch_id = %s WHERE fin_trust_transaction_id = %s",
            (posting["fin_posting_batch_id"], txn["fin_trust_transaction_id"]),
        )

        txn["fin_posting_batch_id"] = posting["fin_posting_batch_id"]
        return txn


def list_trust_transactions(*, matter_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        matter = _get_matter(cur, matter_id)
        cur.execute(
            """SELECT *
               FROM fin_trust_transaction
               WHERE fin_matter_id = %s
                 AND partition_id = %s
               ORDER BY txn_date, created_at""",
            (matter["fin_matter_id"], matter["partition_id"]),
        )
        return cur.fetchall()


def run_contingency(
    *,
    fin_run_id: UUID,
    matter_id: UUID,
    as_of_date: date,
    settlement_amount: Decimal,
    expense_amount: Decimal,
) -> dict:
    with get_cursor() as cur:
        matter = _get_matter(cur, matter_id)
        net_recovery = qmoney(settlement_amount - expense_amount)
        fee_rate = qmoney(matter.get("contingency_fee_rate") or 0)
        firm_fee = qmoney(max(net_recovery, Decimal("0")) * fee_rate)
        client_share = qmoney(net_recovery - firm_fee)

        cur.execute(
            """INSERT INTO fin_contingency_case
               (tenant_id, business_id, partition_id, fin_matter_id, as_of_date,
                settlement_amount, expense_amount, net_recovery, client_share, firm_fee, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'resolved')
               RETURNING *""",
            (
                matter["tenant_id"],
                matter["business_id"],
                matter["partition_id"],
                matter["fin_matter_id"],
                as_of_date,
                qmoney(settlement_amount),
                qmoney(expense_amount),
                net_recovery,
                client_share,
                firm_fee,
            ),
        )
        case = cur.fetchone()

        return {
            "deterministic_hash": f"contingency:{case['fin_contingency_case_id']}",
            "result_refs": [{"result_table": "fin_contingency_case", "result_id": case["fin_contingency_case_id"]}],
            "net_recovery": net_recovery,
            "firm_fee": firm_fee,
            "client_share": client_share,
        }


def get_matter_economics(*, matter_id: UUID) -> dict:
    with get_cursor() as cur:
        matter = _get_matter(cur, matter_id)

        cur.execute(
            """SELECT
                COALESCE(SUM(hours), 0) AS hours,
                COALESCE(SUM(billed_amount), 0) AS billed
               FROM fin_time_capture
               WHERE fin_matter_id = %s""",
            (matter["fin_matter_id"],),
        )
        time_row = cur.fetchone()

        cur.execute(
            """SELECT
                COALESCE(SUM(billed_amount), 0) AS billed,
                COALESCE(SUM(collected_amount), 0) AS collected,
                COALESCE(SUM(writeoff_amount), 0) AS writeoff
               FROM fin_realization_event
               WHERE fin_matter_id = %s""",
            (matter["fin_matter_id"],),
        )
        realization = cur.fetchone()

        cur.execute(
            """SELECT amount, direction
               FROM fin_trust_transaction
               WHERE fin_matter_id = %s
               ORDER BY txn_date, created_at""",
            (matter["fin_matter_id"],),
        )
        trust_balance = compute_trust_balance(cur.fetchall())

        return {
            "fin_matter_id": matter["fin_matter_id"],
            "matter_number": matter["matter_number"],
            "status": matter["status"],
            "hours": qmoney(time_row["hours"]),
            "time_billed": qmoney(time_row["billed"]),
            "realization_billed": qmoney(realization["billed"]),
            "realization_collected": qmoney(realization["collected"]),
            "writeoffs": qmoney(realization["writeoff"]),
            "trust_balance": trust_balance,
        }
