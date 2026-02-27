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


# ── Institutional Growth Fund VII ────────────────────────────────────────────

INVESTMENTS = [
    {"name": "Meridian Office Tower", "strategy": "value_add", "property_type": "office", "acq_price": 45_000_000, "noi_monthly": 375_000, "status": "stabilized", "acq_date": "2024-03-15"},
    {"name": "Harborview Logistics Park", "strategy": "core_plus", "property_type": "industrial", "acq_price": 38_000_000, "noi_monthly": 316_667, "status": "stabilized", "acq_date": "2024-04-01"},
    {"name": "Cascade Multifamily", "strategy": "value_add", "property_type": "multifamily", "acq_price": 52_000_000, "noi_monthly": 390_000, "status": "lease_up", "acq_date": "2024-05-10"},
    {"name": "Summit Retail Center", "strategy": "core", "property_type": "retail", "acq_price": 28_000_000, "noi_monthly": 233_333, "status": "stabilized", "acq_date": "2024-06-01"},
    {"name": "Ironworks Mixed-Use", "strategy": "opportunistic", "property_type": "mixed_use", "acq_price": 41_000_000, "noi_monthly": 273_333, "status": "development", "acq_date": "2024-07-15"},
    {"name": "Lakeside Senior Living", "strategy": "core_plus", "property_type": "senior_housing", "acq_price": 33_000_000, "noi_monthly": 275_000, "status": "stabilized", "acq_date": "2024-08-01"},
    {"name": "Pacific Gateway Hotel", "strategy": "value_add", "property_type": "hospitality", "acq_price": 36_000_000, "noi_monthly": 250_000, "status": "repositioning", "acq_date": "2024-09-01"},
    {"name": "Riverfront Apartments", "strategy": "core", "property_type": "multifamily", "acq_price": 48_000_000, "noi_monthly": 400_000, "status": "stabilized", "acq_date": "2024-10-15"},
    {"name": "Tech Campus North", "strategy": "value_add", "property_type": "office", "acq_price": 55_000_000, "noi_monthly": 412_500, "status": "lease_up", "acq_date": "2024-11-01"},
    {"name": "Harbor Industrial Portfolio", "strategy": "core_plus", "property_type": "industrial", "acq_price": 42_000_000, "noi_monthly": 350_000, "status": "stabilized", "acq_date": "2024-12-01"},
    {"name": "Downtown Mixed-Use", "strategy": "core", "property_type": "mixed_use", "acq_price": 31_000_000, "noi_monthly": 258_333, "status": "stabilized", "acq_date": "2025-01-15"},
    {"name": "Suburban Office Park", "strategy": "value_add", "property_type": "office", "acq_price": 26_000_000, "noi_monthly": 195_000, "status": "value_add", "acq_date": "2025-02-01"},
]

PARTNERS = [
    {"name": "Winston Capital Management", "partner_type": "gp", "committed": 10_000_000},
    {"name": "State Pension Fund", "partner_type": "lp", "committed": 200_000_000},
    {"name": "University Endowment", "partner_type": "lp", "committed": 150_000_000},
    {"name": "Sovereign Wealth Fund", "partner_type": "lp", "committed": 140_000_000},
]

TOTAL_COMMITTED = 500_000_000


def seed_institutional_fund(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
) -> dict:
    """Seed Institutional Growth Fund VII with 12 investments, 4 partners, waterfall, and realistic financials."""
    from uuid import uuid4
    from decimal import Decimal

    result: dict = {"fund_id": str(fund_id)}
    deal_ids: list[UUID] = []
    asset_ids: list[UUID] = []

    with get_cursor() as cur:
        # ─── 1. Create 12 investments (deals + assets) ────────────────────
        for inv in INVESTMENTS:
            deal_id = uuid4()
            asset_id = uuid4()
            deal_ids.append(deal_id)
            asset_ids.append(asset_id)

            cur.execute(
                """
                INSERT INTO repe_deal
                    (deal_id, fund_id, name, strategy, status, acquisition_date)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (deal_id) DO NOTHING
                """,
                (str(deal_id), str(fund_id), inv["name"], inv["strategy"], inv["status"], inv["acq_date"]),
            )
            cur.execute(
                """
                INSERT INTO repe_asset
                    (asset_id, deal_id, name, property_type, market_value)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (asset_id) DO NOTHING
                """,
                (str(asset_id), str(deal_id), inv["name"], inv["property_type"], inv["acq_price"]),
            )

        result["investments"] = len(INVESTMENTS)
        result["deal_ids"] = [str(d) for d in deal_ids]
        result["asset_ids"] = [str(a) for a in asset_ids]

        # ─── 2. Asset quarterly states (2024Q4 → 2025Q4, appreciating) ──
        quarters = ["2024Q4", "2025Q1", "2025Q2", "2025Q3", "2025Q4"]
        appreciation = [1.00, 1.02, 1.04, 1.07, 1.10]  # ~10% total appreciation

        for i, (inv, asset_id, deal_id) in enumerate(zip(INVESTMENTS, asset_ids, deal_ids)):
            for qi, (qtr, mult) in enumerate(zip(quarters, appreciation)):
                nav = round(inv["acq_price"] * mult)
                noi = round(inv["noi_monthly"] * 3 * mult)  # quarterly NOI
                cur.execute(
                    """
                    INSERT INTO re_asset_quarter_state
                        (asset_id, quarter, noi, market_value, occupancy)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (str(asset_id), qtr, noi, nav, 0.92 if inv["status"] == "lease_up" else 0.96),
                )

        result["asset_quarter_states"] = len(INVESTMENTS) * len(quarters)

        # ─── 3. Fund quarterly states (rollup) ───────────────────────────
        total_acq = sum(inv["acq_price"] for inv in INVESTMENTS)
        for qi, (qtr, mult) in enumerate(zip(quarters, appreciation)):
            portfolio_nav = round(total_acq * mult)
            total_called_at_qtr = round(TOTAL_COMMITTED * 0.85)  # ~85% drawn
            total_dist_at_qtr = round(total_acq * 0.03 * (qi + 1))  # cumulative distributions

            cur.execute(
                """
                INSERT INTO re_fund_quarter_state
                    (fund_id, quarter, portfolio_nav, total_committed, total_called, total_distributed)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (str(fund_id), qtr, portfolio_nav, TOTAL_COMMITTED, total_called_at_qtr, total_dist_at_qtr),
            )

        result["fund_quarter_states"] = len(quarters)

        # ─── 4. Partners + commitments ────────────────────────────────────
        partner_ids: list[UUID] = []
        for p in PARTNERS:
            pid = uuid4()
            partner_ids.append(pid)
            cur.execute(
                """
                INSERT INTO re_partner (partner_id, business_id, name, partner_type)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (str(pid), str(business_id), p["name"], p["partner_type"]),
            )
            cur.execute(
                """
                INSERT INTO re_partner_commitment (partner_id, fund_id, committed_amount, commitment_date, status)
                VALUES (%s, %s, %s, '2024-01-15', 'active')
                ON CONFLICT DO NOTHING
                """,
                (str(pid), str(fund_id), p["committed"]),
            )

        result["partners"] = len(PARTNERS)
        result["partner_ids"] = [str(p) for p in partner_ids]

        # ─── 5. Capital ledger entries (pro-rata contributions + distributions) ──
        ledger_count = 0
        total_called_amount = round(TOTAL_COMMITTED * 0.85)
        call_dates = ["2024-03-01", "2024-06-01", "2024-09-01", "2025-01-15"]
        call_amounts = [
            round(total_called_amount * 0.35),  # first draw 35%
            round(total_called_amount * 0.30),  # second draw 30%
            round(total_called_amount * 0.20),  # third draw 20%
            round(total_called_amount * 0.15),  # fourth draw 15%
        ]

        for call_date, call_amt in zip(call_dates, call_amounts):
            qtr = _date_to_quarter(call_date)
            for pid, p in zip(partner_ids, PARTNERS):
                share = Decimal(str(p["committed"])) / Decimal(str(TOTAL_COMMITTED))
                partner_amt = (share * Decimal(str(call_amt))).quantize(Decimal("0.01"))
                cur.execute(
                    """
                    INSERT INTO re_capital_ledger_entry
                        (fund_id, partner_id, entry_type, amount, amount_base, effective_date, quarter, memo, source)
                    VALUES (%s, %s, 'contribution', %s, %s, %s, %s, %s, 'seed')
                    """,
                    (str(fund_id), str(pid), str(partner_amt), str(partner_amt), call_date, qtr, f"Capital call {call_date}"),
                )
                ledger_count += 1

        # Quarterly distributions
        dist_dates = ["2025-03-31", "2025-06-30", "2025-09-30"]
        dist_amounts = [
            round(total_acq * 0.01),   # ~1% of portfolio per quarter
            round(total_acq * 0.01),
            round(total_acq * 0.012),  # slight increase
        ]

        for dist_date, dist_amt in zip(dist_dates, dist_amounts):
            qtr = _date_to_quarter(dist_date)
            for pid, p in zip(partner_ids, PARTNERS):
                share = Decimal(str(p["committed"])) / Decimal(str(TOTAL_COMMITTED))
                partner_amt = (share * Decimal(str(dist_amt))).quantize(Decimal("0.01"))
                cur.execute(
                    """
                    INSERT INTO re_capital_ledger_entry
                        (fund_id, partner_id, entry_type, amount, amount_base, effective_date, quarter, memo, source)
                    VALUES (%s, %s, 'distribution', %s, %s, %s, %s, %s, 'seed')
                    """,
                    (str(fund_id), str(pid), str(partner_amt), str(partner_amt), dist_date, qtr, f"Distribution {dist_date}"),
                )
                ledger_count += 1

        result["capital_ledger_entries"] = ledger_count

        # ─── 6. Cash events ───────────────────────────────────────────────
        cash_events = []
        for call_date, call_amt in zip(call_dates, call_amounts):
            cash_events.append((fund_id, call_date, "CALL", call_amt, f"Capital call {call_date}"))
        for dist_date, dist_amt in zip(dist_dates, dist_amounts):
            cash_events.append((fund_id, dist_date, "DIST", dist_amt, f"Distribution {dist_date}"))

        # Quarterly fees
        fee_dates = ["2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31", "2025-06-30", "2025-09-30"]
        quarterly_fee = round(TOTAL_COMMITTED * 0.015 / 4)  # 1.5% annual on committed / 4
        for fd in fee_dates:
            cash_events.append((fund_id, fd, "FEE", quarterly_fee, f"Mgmt fee {fd}"))

        # Quarterly fund expenses
        expense_dates = ["2025-03-31", "2025-06-30", "2025-09-30"]
        for ed in expense_dates:
            cash_events.append((fund_id, ed, "EXPENSE", 85_000, f"Admin/audit/legal {ed}"))

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

        # ─── 7. Fee policy ────────────────────────────────────────────────
        cur.execute(
            """
            INSERT INTO re_fee_policy
                (env_id, business_id, fund_id, fee_basis, annual_rate, start_date, stepdown_date, stepdown_rate)
            VALUES (%s, %s, %s, 'COMMITTED', 0.015, '2024-01-15', '2028-01-15', 0.0125)
            """,
            (env_id, str(business_id), str(fund_id)),
        )

        # ─── 8. Fund expenses per quarter ─────────────────────────────────
        expense_qtrs = ["2025Q1", "2025Q2", "2025Q3"]
        for eq in expense_qtrs:
            cur.execute(
                """
                INSERT INTO re_fund_expense_qtr
                    (env_id, business_id, fund_id, quarter, expense_type, amount)
                VALUES (%s, %s, %s, %s, 'admin', 40000),
                       (%s, %s, %s, %s, 'audit', 25000),
                       (%s, %s, %s, %s, 'legal', 20000)
                """,
                (env_id, str(business_id), str(fund_id), eq) * 3,
            )
        result["fund_expenses"] = len(expense_qtrs) * 3

        # ─── 9. Waterfall definition ──────────────────────────────────────
        wf_def_id = uuid4()
        cur.execute(
            """
            INSERT INTO re_waterfall_definition
                (definition_id, fund_id, waterfall_type, version, is_active)
            VALUES (%s, %s, 'american', 1, true)
            """,
            (str(wf_def_id), str(fund_id)),
        )

        # Waterfall tiers
        tiers = [
            (1, "return_of_capital", None, None, None, None),
            (2, "preferred_return", 0.08, None, None, None),
            (3, "catch_up", None, None, 1.0, None),
            (4, "split", None, 0.20, None, 0.80),
        ]
        for order, tier_type, hurdle, split_gp, catchup, split_lp in tiers:
            cur.execute(
                """
                INSERT INTO re_waterfall_tier
                    (definition_id, tier_order, tier_type, hurdle_rate, split_gp, catch_up_percent, split_lp)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (str(wf_def_id), order, tier_type, hurdle, split_gp, catchup, split_lp),
            )
        result["waterfall_definition_id"] = str(wf_def_id)

        # ─── 10. Base scenario + assumption set ──────────────────────────
        scenario_id = uuid4()
        cur.execute(
            """
            INSERT INTO re_scenario
                (scenario_id, fund_id, name, scenario_type, is_base, status)
            VALUES (%s, %s, 'Base Case', 'base', true, 'active')
            """,
            (str(scenario_id), str(fund_id)),
        )

        assumption_set_id = uuid4()
        cur.execute(
            """
            INSERT INTO re_assumption_set
                (set_id, fund_id, name, version, is_active)
            VALUES (%s, %s, 'Initial Underwrite', 1, true)
            """,
            (str(assumption_set_id), str(fund_id)),
        )

        # Standard growth assumptions
        assumptions = [
            ("exit_cap_rate", "0.055"),
            ("rent_growth_annual", "0.03"),
            ("expense_growth_annual", "0.025"),
            ("vacancy_rate", "0.05"),
            ("hold_period_years", "5"),
        ]
        for key, val in assumptions:
            cur.execute(
                """
                INSERT INTO re_assumption_value
                    (set_id, scope_node_type, key, value_decimal)
                VALUES (%s, 'fund', %s, %s)
                """,
                (str(assumption_set_id), key, val),
            )

        result["scenario_id"] = str(scenario_id)
        result["assumption_set_id"] = str(assumption_set_id)

        # ─── 11. Seed budget + actuals via parent function ────────────────
        # Reuse NOI_LINES and budget patterns for each asset

    # Also seed FI data (COA, mapping rules, budgets, actuals) for the new assets
    fi_result = seed_fi_data(
        env_id=env_id,
        business_id=business_id,
        fund_id=fund_id,
        asset_ids=asset_ids,
    )
    result["fi_data"] = fi_result

    emit_log(
        level="info",
        service="backend",
        action="re.fi.seed.institutional",
        message=f"Institutional Growth Fund VII seeded with {len(INVESTMENTS)} investments",
        context={"env_id": env_id, "business_id": str(business_id), "fund_id": str(fund_id)},
    )

    return result


def _date_to_quarter(date_str: str) -> str:
    """Convert 'YYYY-MM-DD' to 'YYYYQn'."""
    parts = date_str.split("-")
    year = parts[0]
    month = int(parts[1])
    q = (month - 1) // 3 + 1
    return f"{year}Q{q}"
