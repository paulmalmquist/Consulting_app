"""Seed data for financial intelligence layer.

Seeds realistic accounting data, budgets, fee policies, cash events,
loans, and covenant definitions for 2 quarters (2026Q1, 2026Q2).
"""
from __future__ import annotations

from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


# ── Standard NOI Line Codes ──────────────────────────────────────────────────
NOI_LINES = [
    ("RENT", "Gross Rental Revenue"),
    ("VACANCY", "Vacancy & Credit Loss"),
    ("OTHER_INCOME", "Other Income"),
    ("PAYROLL", "Payroll & Benefits"),
    ("TAXES", "Real Estate Taxes"),
    ("INSURANCE", "Insurance"),
    ("UTILITIES", "Utilities"),
    ("REPAIRS", "Repairs & Maintenance"),
    ("MGMT_FEE_PROP", "Property Management Fee"),
    ("ADMIN", "General & Administrative"),
]


def seed_fi_data(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    asset_ids: list[UUID],
    debt_fund_id: UUID | None = None,
) -> dict:
    """Seed all financial intelligence data for testing."""
    result = {}

    with get_cursor() as cur:
        # ─── 1. Chart of Accounts ────────────────────────────────────────
        gl_accounts = [
            ("4000", "Gross Rental Revenue", "revenue", False),
            ("4100", "Vacancy & Credit Loss", "revenue", False),
            ("4200", "Other Income", "revenue", False),
            ("5000", "Payroll & Benefits", "operating", False),
            ("5100", "Real Estate Taxes", "operating", False),
            ("5200", "Insurance", "operating", False),
            ("5300", "Utilities", "operating", False),
            ("5400", "Repairs & Maintenance", "operating", False),
            ("5500", "Property Management Fee", "operating", False),
            ("5600", "General & Administrative", "operating", False),
            ("1000", "Cash", "asset", True),
            ("2000", "Mortgage Payable", "liability", True),
            ("3000", "Equity", "equity", True),
        ]
        for gl, name, cat, is_bs in gl_accounts:
            cur.execute(
                """
                INSERT INTO acct_chart_of_accounts (gl_account, name, category, is_balance_sheet)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (gl_account) DO NOTHING
                """,
                (gl, name, cat, is_bs),
            )
        result["chart_of_accounts"] = len(gl_accounts)

        # ─── 2. Mapping Rules ────────────────────────────────────────────
        mappings = [
            ("4000", "RENT", "NOI", 1),
            ("4100", "VACANCY", "NOI", -1),
            ("4200", "OTHER_INCOME", "NOI", 1),
            ("5000", "PAYROLL", "NOI", -1),
            ("5100", "TAXES", "NOI", -1),
            ("5200", "INSURANCE", "NOI", -1),
            ("5300", "UTILITIES", "NOI", -1),
            ("5400", "REPAIRS", "NOI", -1),
            ("5500", "MGMT_FEE_PROP", "NOI", -1),
            ("5600", "ADMIN", "NOI", -1),
            ("1000", "CASH", "BS", 1),
            ("2000", "DEBT", "BS", 1),
            ("3000", "EQUITY", "BS", 1),
        ]
        for gl, code, stmt, sign in mappings:
            cur.execute(
                """
                INSERT INTO acct_mapping_rule
                    (env_id, business_id, gl_account, target_line_code, target_statement, sign_multiplier)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (env_id, str(business_id), gl, code, stmt, sign),
            )
        result["mapping_rules"] = len(mappings)

        # ─── 3. UW Version + Budget ──────────────────────────────────────
        cur.execute(
            """
            INSERT INTO uw_version (env_id, business_id, name, effective_from)
            VALUES (%s, %s, 'Initial Underwrite', '2026-01-01')
            RETURNING id
            """,
            (env_id, str(business_id)),
        )
        uw_version = cur.fetchone()
        uw_version_id = uw_version["id"] if uw_version else None
        result["uw_version_id"] = str(uw_version_id) if uw_version_id else None

        # Budget data per asset per month (6 months: Jan–Jun 2026)
        budget_data = {
            "RENT": 85000,
            "VACANCY": 4250,  # ~5% vacancy
            "OTHER_INCOME": 3200,
            "PAYROLL": 12000,
            "TAXES": 8500,
            "INSURANCE": 3200,
            "UTILITIES": 4800,
            "REPAIRS": 3500,
            "MGMT_FEE_PROP": 2550,  # 3% of rent
            "ADMIN": 2000,
        }

        months = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"]
        budget_rows = 0
        for asset_id in asset_ids:
            for month in months:
                for code, amt in budget_data.items():
                    cur.execute(
                        """
                        INSERT INTO uw_noi_budget_monthly
                            (env_id, business_id, asset_id, uw_version_id, period_month, line_code, amount)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (env_id, str(business_id), str(asset_id), str(uw_version_id), month, code, amt),
                    )
                    budget_rows += 1
        result["budget_rows"] = budget_rows

        # ─── 4. Accounting Actuals (with slight variances) ───────────────
        # Actuals vary ±5-15% from budget for realism
        actual_multipliers = {
            "RENT": [1.02, 1.01, 1.03, 1.04, 1.02, 1.05],
            "VACANCY": [1.20, 1.15, 0.90, 1.10, 1.25, 0.95],
            "OTHER_INCOME": [0.95, 1.10, 0.85, 1.05, 1.15, 0.90],
            "PAYROLL": [1.05, 1.03, 1.08, 1.02, 1.06, 1.04],
            "TAXES": [1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
            "INSURANCE": [1.00, 1.00, 1.00, 1.02, 1.02, 1.02],
            "UTILITIES": [1.15, 1.10, 0.95, 0.85, 0.80, 1.20],
            "REPAIRS": [0.60, 2.10, 0.80, 1.50, 0.40, 1.80],
            "MGMT_FEE_PROP": [1.02, 1.01, 1.03, 1.04, 1.02, 1.05],
            "ADMIN": [0.90, 1.05, 1.10, 0.95, 1.15, 0.88],
        }

        gl_code_map = {
            "RENT": "4000", "VACANCY": "4100", "OTHER_INCOME": "4200",
            "PAYROLL": "5000", "TAXES": "5100", "INSURANCE": "5200",
            "UTILITIES": "5300", "REPAIRS": "5400", "MGMT_FEE_PROP": "5500", "ADMIN": "5600",
        }

        actual_rows = 0
        for asset_id in asset_ids:
            for i, month in enumerate(months):
                for code, base_amt in budget_data.items():
                    mult = actual_multipliers[code][i]
                    actual_amt = round(base_amt * mult, 2)
                    gl = gl_code_map[code]

                    # GL balance
                    cur.execute(
                        """
                        INSERT INTO acct_gl_balance_monthly
                            (env_id, business_id, asset_id, period_month, gl_account, amount, source_id)
                        VALUES (%s, %s, %s, %s, %s, %s, 'seed')
                        """,
                        (env_id, str(business_id), str(asset_id), month, gl, actual_amt),
                    )

                    # Pre-normalized NOI
                    sign = 1 if code in ("RENT", "OTHER_INCOME") else -1
                    if code == "VACANCY":
                        sign = -1
                    cur.execute(
                        """
                        INSERT INTO acct_normalized_noi_monthly
                            (env_id, business_id, asset_id, period_month, line_code, amount, source_hash)
                        VALUES (%s, %s, %s, %s, %s, %s, 'seed')
                        """,
                        (env_id, str(business_id), str(asset_id), month, code, actual_amt * sign),
                    )
                    actual_rows += 1
        result["actual_rows"] = actual_rows

        # ─── 5. Fee Policy ───────────────────────────────────────────────
        cur.execute(
            """
            INSERT INTO re_fee_policy
                (env_id, business_id, fund_id, fee_basis, annual_rate, start_date, stepdown_date, stepdown_rate)
            VALUES (%s, %s, %s, 'COMMITTED', 0.015, '2026-01-01', '2029-01-01', 0.0125)
            """,
            (env_id, str(business_id), str(fund_id)),
        )
        result["fee_policy"] = "1.5% on committed, stepping down to 1.25% after 2029"

        if debt_fund_id:
            cur.execute(
                """
                INSERT INTO re_fee_policy
                    (env_id, business_id, fund_id, fee_basis, annual_rate, start_date)
                VALUES (%s, %s, %s, 'CALLED', 0.01, '2026-01-01')
                """,
                (env_id, str(business_id), str(debt_fund_id)),
            )

        # ─── 6. Cash Events ─────────────────────────────────────────────
        cash_events = [
            (fund_id, "2026-01-15", "CALL", 25000000, "Q1 capital call"),
            (fund_id, "2026-03-31", "DIST", 1500000, "Q1 distribution"),
            (fund_id, "2026-04-15", "CALL", 10000000, "Q2 capital call"),
            (fund_id, "2026-06-30", "DIST", 2000000, "Q2 distribution"),
            (fund_id, "2026-01-15", "FEE", 93750, "Q1 mgmt fee"),
            (fund_id, "2026-04-15", "FEE", 93750, "Q2 mgmt fee"),
            (fund_id, "2026-03-31", "EXPENSE", 45000, "Q1 admin/audit"),
            (fund_id, "2026-06-30", "EXPENSE", 52000, "Q2 admin/audit/legal"),
        ]
        for fid, dt, etype, amt, memo in cash_events:
            cur.execute(
                """
                INSERT INTO re_cash_event
                    (env_id, business_id, fund_id, event_date, event_type, amount, memo)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (env_id, str(business_id), str(fid), dt, etype, amt, memo),
            )
        result["cash_events"] = len(cash_events)

        # Fund expenses
        expenses = [
            (fund_id, "2026Q1", "admin", 25000),
            (fund_id, "2026Q1", "audit", 15000),
            (fund_id, "2026Q1", "legal", 5000),
            (fund_id, "2026Q2", "admin", 27000),
            (fund_id, "2026Q2", "audit", 15000),
            (fund_id, "2026Q2", "legal", 10000),
        ]
        for fid, qtr, etype, amt in expenses:
            cur.execute(
                """
                INSERT INTO re_fund_expense_qtr
                    (env_id, business_id, fund_id, quarter, expense_type, amount)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (env_id, str(business_id), str(fid), qtr, etype, amt),
            )
        result["fund_expenses"] = len(expenses)

        # ─── 7. Debt Loan + Covenants (for debt fund) ───────────────────
        if debt_fund_id:
            cur.execute(
                """
                INSERT INTO re_loan
                    (env_id, business_id, fund_id, loan_name, upb, rate_type, rate, spread, maturity, amort_type)
                VALUES (%s, %s, %s, 'Senior Secured Note A', 15000000, 'floating', 0.065, 0.025, '2029-06-30', 'interest_only')
                RETURNING id
                """,
                (env_id, str(business_id), str(debt_fund_id)),
            )
            loan = cur.fetchone()
            loan_id = loan["id"] if loan else None

            if loan_id:
                # DSCR covenant: must be >= 1.25
                cur.execute(
                    """
                    INSERT INTO re_loan_covenant_definition
                        (env_id, business_id, loan_id, covenant_type, comparator, threshold, frequency, cure_days)
                    VALUES (%s, %s, %s, 'DSCR', '>=', 1.25, 'quarterly', 30)
                    """,
                    (env_id, str(business_id), str(loan_id)),
                )
                # LTV covenant: must be <= 0.75
                cur.execute(
                    """
                    INSERT INTO re_loan_covenant_definition
                        (env_id, business_id, loan_id, covenant_type, comparator, threshold, frequency, cure_days)
                    VALUES (%s, %s, %s, 'LTV', '<=', 0.75, 'quarterly', 30)
                    """,
                    (env_id, str(business_id), str(loan_id)),
                )
                # Debt Yield covenant: must be >= 0.08
                cur.execute(
                    """
                    INSERT INTO re_loan_covenant_definition
                        (env_id, business_id, loan_id, covenant_type, comparator, threshold, frequency, cure_days)
                    VALUES (%s, %s, %s, 'DEBT_YIELD', '>=', 0.08, 'quarterly', 30)
                    """,
                    (env_id, str(business_id), str(loan_id)),
                )
                result["loan_id"] = str(loan_id)
                result["covenants"] = 3

            # Debt fund cash events
            debt_cash = [
                (debt_fund_id, "2026-01-10", "CALL", 15000000, "Fund II initial call"),
                (debt_fund_id, "2026-03-31", "DIST", 250000, "Q1 interest distribution"),
                (debt_fund_id, "2026-01-10", "LOAN_DRAW", 15000000, "Senior Note A draw"),
            ]
            for fid, dt, etype, amt, memo in debt_cash:
                cur.execute(
                    """
                    INSERT INTO re_cash_event
                        (env_id, business_id, fund_id, event_date, event_type, amount, memo)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (env_id, str(business_id), str(fid), dt, etype, amt, memo),
                )

    emit_log(
        level="info",
        service="backend",
        action="re.fi.seed",
        message="Financial intelligence seed data created",
        context={"env_id": env_id, "business_id": str(business_id)},
    )

    return result
