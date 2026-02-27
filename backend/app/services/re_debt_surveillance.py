"""Debt surveillance service.

Manages loans, covenant definitions, covenant testing, and watchlist events.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import re_amortization


def list_loans(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_loan
            WHERE env_id = %s AND business_id = %s AND fund_id = %s
            ORDER BY loan_name
            """,
            (env_id, str(business_id), str(fund_id)),
        )
        return cur.fetchall()


def get_loan(*, loan_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM re_loan WHERE id = %s", (str(loan_id),))
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Loan {loan_id} not found")
        return row


def list_covenants(*, loan_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_loan_covenant_definition
            WHERE loan_id = %s AND active = true
            ORDER BY covenant_type
            """,
            (str(loan_id),),
        )
        return cur.fetchall()


def get_covenant_results(
    *,
    loan_id: UUID,
    quarter: str | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        conditions = ["loan_id = %s"]
        params: list = [str(loan_id)]
        if quarter:
            conditions.append("quarter = %s")
            params.append(quarter)
        cur.execute(
            f"""
            SELECT * FROM re_loan_covenant_result_qtr
            WHERE {' AND '.join(conditions)}
            ORDER BY quarter DESC
            """,
            params,
        )
        return cur.fetchall()


def run_covenant_tests(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
    run_id: UUID,
) -> dict:
    """Run covenant tests for all loans in a debt fund.

    For each loan:
    1. Get covenant definitions
    2. Compute current DSCR, LTV, Debt Yield from available data
    3. Test against thresholds
    4. Write results + watchlist events for breaches
    """
    results = []
    violations = 0
    total_tested = 0

    with get_cursor() as cur:
        # Verify this is a debt fund
        cur.execute(
            "SELECT strategy FROM repe_fund WHERE fund_id = %s",
            (str(fund_id),),
        )
        fund = cur.fetchone()
        if not fund or fund.get("strategy") != "debt":
            raise ValueError(f"Fund {fund_id} is not a debt fund — covenant tests only apply to debt funds")

        # Get all loans for this fund
        cur.execute(
            """
            SELECT * FROM re_loan
            WHERE env_id = %s AND business_id = %s AND fund_id = %s
            """,
            (env_id, str(business_id), str(fund_id)),
        )
        loans = cur.fetchall()

        for loan in loans:
            loan_id = loan["id"]
            upb = Decimal(str(loan["upb"]))
            rate = Decimal(str(loan["rate"]))

            # Get covenants for this loan
            cur.execute(
                """
                SELECT * FROM re_loan_covenant_definition
                WHERE loan_id = %s AND active = true
                """,
                (str(loan_id),),
            )
            covenants = cur.fetchall()

            if not covenants:
                continue

            # Try to get asset NOI for DSCR/DY computation
            noi = Decimal("0")
            asset_value = Decimal("0")
            if loan.get("asset_id"):
                cur.execute(
                    """
                    SELECT noi, asset_value FROM re_asset_quarter_state
                    WHERE asset_id = %s AND quarter = %s
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (str(loan["asset_id"]), quarter),
                )
                state = cur.fetchone()
                if state:
                    noi = Decimal(str(state["noi"] or 0))
                    asset_value = Decimal(str(state["asset_value"] or 0))

            # Compute metrics — prefer amortization schedule over simple interest
            try:
                ds = re_amortization.get_debt_service_summary(
                    loan_id=loan_id, quarter=quarter
                )
                annual_debt_service = Decimal(ds["annual_debt_service"])
            except (LookupError, ValueError):
                annual_debt_service = upb * rate
            dscr = (noi / annual_debt_service).quantize(Decimal("0.01")) if annual_debt_service > 0 else None
            ltv = (upb / asset_value).quantize(Decimal("0.0001")) if asset_value > 0 else None
            debt_yield = (noi / upb).quantize(Decimal("0.0001")) if upb > 0 else None

            # Test each covenant
            all_pass = True
            for cov in covenants:
                threshold = Decimal(str(cov["threshold"]))
                comparator = cov["comparator"]
                cov_type = cov["covenant_type"]

                test_value = None
                if cov_type == "DSCR":
                    test_value = dscr
                elif cov_type == "LTV":
                    test_value = ltv
                elif cov_type == "DEBT_YIELD":
                    test_value = debt_yield

                passed = True
                headroom = None
                if test_value is not None:
                    if comparator == ">=" and test_value < threshold:
                        passed = False
                    elif comparator == "<=" and test_value > threshold:
                        passed = False
                    headroom = (test_value - threshold).quantize(Decimal("0.0001"))
                else:
                    passed = False  # Can't test = fail

                if not passed:
                    all_pass = False
                    violations += 1

                total_tested += 1

            breached = not all_pass

            # Store result
            cur.execute(
                """
                INSERT INTO re_loan_covenant_result_qtr
                    (run_id, env_id, business_id, fund_id, loan_id, quarter,
                     dscr, ltv, debt_yield, pass, headroom, breached)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    str(run_id), env_id, str(business_id), str(fund_id),
                    str(loan_id), quarter,
                    str(dscr) if dscr is not None else None,
                    str(ltv) if ltv is not None else None,
                    str(debt_yield) if debt_yield is not None else None,
                    all_pass,
                    str(headroom) if headroom is not None else None,
                    breached,
                ),
            )
            result = cur.fetchone()
            results.append(result)

            # Write watchlist event if breached
            if breached:
                severity = "HIGH" if violations > 1 else "MED"
                breach_reasons = []
                if dscr is not None and any(
                    c["covenant_type"] == "DSCR" and c["comparator"] == ">=" and dscr < Decimal(str(c["threshold"]))
                    for c in covenants
                ):
                    breach_reasons.append(f"DSCR {dscr} below threshold")
                if ltv is not None and any(
                    c["covenant_type"] == "LTV" and c["comparator"] == "<=" and ltv > Decimal(str(c["threshold"]))
                    for c in covenants
                ):
                    breach_reasons.append(f"LTV {ltv} above threshold")
                if debt_yield is not None and any(
                    c["covenant_type"] == "DEBT_YIELD" and c["comparator"] == ">=" and debt_yield < Decimal(str(c["threshold"]))
                    for c in covenants
                ):
                    breach_reasons.append(f"Debt Yield {debt_yield} below threshold")

                reason = "; ".join(breach_reasons) if breach_reasons else "Covenant breach detected"

                cur.execute(
                    """
                    INSERT INTO re_loan_watchlist_event
                        (env_id, business_id, fund_id, loan_id, quarter, severity, reason)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (env_id, str(business_id), str(fund_id), str(loan_id), quarter, severity, reason),
                )

    emit_log(
        level="info",
        service="backend",
        action="re.debt.covenant_tests",
        message=f"Covenant tests: {total_tested} tested, {violations} violations",
        context={
            "fund_id": str(fund_id), "quarter": quarter, "run_id": str(run_id),
            "total_tested": total_tested, "violations": violations,
        },
    )

    return {
        "results": results,
        "violations": violations,
        "total_tested": total_tested,
    }


def get_watchlist(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        conditions = ["env_id = %s", "business_id = %s", "fund_id = %s"]
        params: list = [env_id, str(business_id), str(fund_id)]
        if quarter:
            conditions.append("quarter = %s")
            params.append(quarter)
        cur.execute(
            f"""
            SELECT * FROM re_loan_watchlist_event
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC
            """,
            params,
        )
        return cur.fetchall()
