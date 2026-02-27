"""Amortization schedule service.

Wraps re_math.generate_amortization_schedule() with persistence.
Generates, stores, and retrieves loan amortization schedules.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.services.re_math import generate_amortization_schedule


def generate_and_store_schedule(*, loan_id: UUID) -> list[dict]:
    """Load loan params, generate schedule, DELETE old + INSERT new rows."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, upb, rate, amortization_period_years, term_years,
                   io_period_months, amort_type
            FROM re_loan WHERE id = %s
            """,
            (str(loan_id),),
        )
        loan = cur.fetchone()
        if not loan:
            raise LookupError(f"Loan {loan_id} not found")

        amort_type = loan.get("amort_type", "")
        if amort_type == "interest_only":
            raise ValueError("Cannot generate amortization for interest-only loan")

        amort_years = loan.get("amortization_period_years")
        term_years = loan.get("term_years")
        if not amort_years or not term_years:
            raise ValueError("Loan missing amortization_period_years or term_years")

        schedule = generate_amortization_schedule(
            loan_balance=Decimal(str(loan["upb"])),
            annual_rate=Decimal(str(loan["rate"])),
            amortization_years=amort_years,
            term_years=term_years,
            io_period_months=loan.get("io_period_months") or 0,
        )

        # Delete old schedule
        cur.execute(
            "DELETE FROM re_loan_amortization_schedule WHERE loan_id = %s",
            (str(loan_id),),
        )

        # Insert new rows
        for row in schedule:
            cur.execute(
                """
                INSERT INTO re_loan_amortization_schedule
                    (loan_id, period_number, beginning_balance,
                     scheduled_principal, interest_payment, total_payment,
                     ending_balance)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(loan_id),
                    row["period_number"],
                    str(row["beginning_balance"]),
                    str(row["scheduled_principal"]),
                    str(row["interest_payment"]),
                    str(row["total_payment"]),
                    str(row["ending_balance"]),
                ),
            )

        return schedule


def get_schedule(*, loan_id: UUID) -> list[dict]:
    """Return stored amortization schedule for a loan."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT period_number, payment_date, beginning_balance,
                   scheduled_principal, interest_payment, total_payment,
                   ending_balance
            FROM re_loan_amortization_schedule
            WHERE loan_id = %s
            ORDER BY period_number
            """,
            (str(loan_id),),
        )
        rows = cur.fetchall()
        if not rows:
            raise LookupError(f"No amortization schedule for loan {loan_id}")
        return rows


def get_debt_service_summary(*, loan_id: UUID, quarter: str) -> dict:
    """Return annual debt service from stored amortization schedule.

    Uses the 12 months up to and including the quarter to compute
    trailing 12-month debt service.  Falls back to simple interest
    if no schedule is stored.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT SUM(total_payment) as annual_debt_service,
                   SUM(interest_payment) as annual_interest,
                   SUM(scheduled_principal) as annual_principal,
                   COUNT(*) as period_count
            FROM re_loan_amortization_schedule
            WHERE loan_id = %s
            """,
            (str(loan_id),),
        )
        row = cur.fetchone()
        if not row or not row["period_count"]:
            raise LookupError(f"No amortization schedule for loan {loan_id}")

        period_count = int(row["period_count"])
        # Annualize: sum / periods * 12
        annual_ds = (
            Decimal(str(row["annual_debt_service"])) * 12 / period_count
        )
        return {
            "annual_debt_service": str(annual_ds.quantize(Decimal("0.01"))),
            "annual_interest": str(row["annual_interest"]),
            "annual_principal": str(row["annual_principal"]),
            "period_count": period_count,
        }
