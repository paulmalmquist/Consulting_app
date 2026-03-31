"""
Golden path chain validation tests.

Validates the full asset → JV → investment → fund → waterfall rollup chain
against deterministic constants from 432_re_golden_path_seed.sql.

All tests are pure-math / no DB. They mirror the locked values in the seed
and verify every identity that the runtime rollup engine must preserve.

Asset: Gateway Industrial Center, 100K SF industrial, Austin TX
Hold: 8 quarters (2025Q1–2026Q4), IO debt, terminal sale Q8
JV: 80% fund / 20% operating partner
"""

from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

import pytest

# ═══════════════════════════════════════════════════════════════════════════
# Golden path constants (mirrors 432_re_golden_path_seed.sql)
# ═══════════════════════════════════════════════════════════════════════════

GP_ASSET_ID = UUID("f0000000-9001-0003-0001-000000000001")
GP_DEAL_ID = UUID("f0000000-9001-0001-0001-000000000001")
GP_JV_ID = UUID("f0000000-9001-0002-0001-000000000001")
GP_FUND_ID = UUID("a1b2c3d4-0003-0030-0001-000000000001")
GP_LOAN_ID = UUID("f0000000-9001-0004-0001-000000000001")

PURCHASE_PRICE = Decimal("10400000")
LOAN_AMOUNT = Decimal("6760000")
EQUITY_AMOUNT = Decimal("3640000")
JV_FUND_PCT = Decimal("0.80")
JV_PARTNER_PCT = Decimal("0.20")
IO_QUARTERLY = Decimal("88725")  # 6,760,000 × 5.25% / 4

# Locked quarterly values (8 periods)
QUARTERS = [
    "2025Q1", "2025Q2", "2025Q3", "2025Q4",
    "2026Q1", "2026Q2", "2026Q3", "2026Q4",
]
REVENUE = [150000, 150750, 151503, 152260, 153021, 153786, 154554, 155327]
OPEX = [7500, 7538, 7575, 7613, 7651, 7689, 7728, 7766]
NOI = [142500, 143213, 143928, 144648, 145370, 146097, 146827, 147560]
CAPEX = [10000] * 8
RESERVES = [4500] * 8
DEBT_SVC = [88725] * 8
NCF = [39275, 39988, 40703, 41423, 42145, 42872, 43602, 44335]

# Terminal sale (Q8)
GROSS_SALE = Decimal("11804800")
SALE_COSTS = Decimal("354144")  # 3% of gross
DEBT_PAYOFF = Decimal("6760000")  # IO, unchanged
NET_SALE = Decimal("4690656")

# Derived totals
TOTAL_OPERATING_NCF = Decimal("334343")  # sum(NCF)
FUND_OPERATING_NCF = Decimal("267474")  # 80% of above (truncated)
FUND_SALE_PROCEEDS = Decimal("3752525")  # 80% of net sale
TOTAL_EQUITY_DISTRIBUTIONS = Decimal("5024999")  # operating + sale
EXPECTED_TVPI = Decimal("1.3805")

# Valuation
CAP_RATE = Decimal("0.055")  # 5.5% operating cap
EXIT_CAP_RATE = Decimal("0.05")  # 5.0% exit cap


# ═══════════════════════════════════════════════════════════════════════════
# LAYER 1: Asset-level identities
# ═══════════════════════════════════════════════════════════════════════════

class TestAssetLayerIdentities:
    """Verify NOI = revenue - opex and NCF = NOI - capex - reserves - debt_svc."""

    @pytest.mark.parametrize("i", range(8), ids=QUARTERS)
    def test_noi_equals_revenue_minus_opex(self, i: int):
        """NOI ≈ revenue - opex within $1 (seed rounds independently)."""
        computed = REVENUE[i] - OPEX[i]
        assert abs(NOI[i] - computed) <= 1, (
            f"Q{i}: NOI {NOI[i]} != {REVENUE[i]} - {OPEX[i]} = {computed} (diff > $1)"
        )

    @pytest.mark.parametrize("i", range(8), ids=QUARTERS)
    def test_ncf_equals_noi_minus_below_line(self, i: int):
        expected = NOI[i] - CAPEX[i] - RESERVES[i] - DEBT_SVC[i]
        assert NCF[i] == expected, (
            f"Q{i}: NCF {NCF[i]} != NOI({NOI[i]}) - capex({CAPEX[i]}) "
            f"- reserves({RESERVES[i]}) - debt({DEBT_SVC[i]}) = {expected}"
        )

    def test_total_operating_ncf(self):
        actual = sum(NCF)
        assert actual == int(TOTAL_OPERATING_NCF), (
            f"Sum(NCF) {actual} != expected {TOTAL_OPERATING_NCF}"
        )

    @pytest.mark.parametrize("i", range(8), ids=QUARTERS)
    def test_revenue_grows_monotonically(self, i: int):
        if i > 0:
            assert REVENUE[i] > REVENUE[i - 1], (
                f"Revenue should grow: Q{i} {REVENUE[i]} <= Q{i-1} {REVENUE[i-1]}"
            )

    @pytest.mark.parametrize("i", range(8), ids=QUARTERS)
    def test_debt_service_constant_io(self, i: int):
        assert DEBT_SVC[i] == int(IO_QUARTERLY), (
            f"IO debt service should be constant {IO_QUARTERLY}, got {DEBT_SVC[i]}"
        )


# ═══════════════════════════════════════════════════════════════════════════
# LAYER 2: Sale / exit identities
# ═══════════════════════════════════════════════════════════════════════════

class TestSaleIdentities:
    """Verify sale proceeds math at asset level."""

    def test_net_sale_equals_gross_minus_costs_minus_debt(self):
        computed = GROSS_SALE - SALE_COSTS - DEBT_PAYOFF
        assert computed == NET_SALE, f"{computed} != {NET_SALE}"

    def test_sale_costs_are_3_percent(self):
        expected = (GROSS_SALE * Decimal("0.03")).quantize(Decimal("1"))
        assert SALE_COSTS == expected, f"{SALE_COSTS} != 3% of {GROSS_SALE} = {expected}"

    def test_exit_cap_rate_implies_gross_price(self):
        # Exit NOI annualized = Q8 NOI * 4
        exit_noi_annual = Decimal(str(NOI[7])) * 4
        expected_gross = (exit_noi_annual / EXIT_CAP_RATE).quantize(Decimal("1"), ROUND_HALF_UP)
        assert GROSS_SALE == expected_gross, (
            f"Gross sale {GROSS_SALE} != (NOI_Q8 {NOI[7]} × 4) / {EXIT_CAP_RATE} = {expected_gross}"
        )

    def test_debt_payoff_equals_original_loan(self):
        """IO loan — no amortization, payoff = original balance."""
        assert DEBT_PAYOFF == LOAN_AMOUNT


# ═══════════════════════════════════════════════════════════════════════════
# LAYER 3: JV ownership split
# ═══════════════════════════════════════════════════════════════════════════

class TestJVLayer:
    """Verify JV 80/20 ownership split on cash flows."""

    @pytest.mark.parametrize("i", range(8), ids=QUARTERS)
    def test_fund_cf_is_80_pct_of_ncf(self, i: int):
        fund_cf = Decimal(str(NCF[i])) * JV_FUND_PCT
        partner_cf = Decimal(str(NCF[i])) * JV_PARTNER_PCT
        assert fund_cf + partner_cf == Decimal(str(NCF[i])), (
            f"Fund({fund_cf}) + Partner({partner_cf}) != NCF({NCF[i]})"
        )

    def test_fund_operating_ncf_total(self):
        total = sum(Decimal(str(n)) * JV_FUND_PCT for n in NCF)
        # Allow $1 rounding tolerance (integer truncation in seed)
        assert abs(total - Decimal(str(FUND_OPERATING_NCF))) < 2, (
            f"Fund operating NCF {total} != expected {FUND_OPERATING_NCF}"
        )

    def test_fund_sale_proceeds(self):
        computed = (NET_SALE * JV_FUND_PCT).quantize(Decimal("1"), ROUND_HALF_UP)
        # Allow $1 rounding tolerance
        assert abs(computed - FUND_SALE_PROCEEDS) < 2, (
            f"Fund sale proceeds {computed} != expected {FUND_SALE_PROCEEDS}"
        )

    def test_ownership_sums_to_100(self):
        assert JV_FUND_PCT + JV_PARTNER_PCT == Decimal("1.00")


# ═══════════════════════════════════════════════════════════════════════════
# LAYER 4: Fund-level return metrics
# ═══════════════════════════════════════════════════════════════════════════

class TestFundReturnMetrics:
    """Verify TVPI and distribution totals."""

    def test_total_equity_distributions(self):
        computed = TOTAL_OPERATING_NCF + NET_SALE
        assert computed == TOTAL_EQUITY_DISTRIBUTIONS, (
            f"Total distributions {computed} != {TOTAL_EQUITY_DISTRIBUTIONS}"
        )

    def test_tvpi(self):
        computed = (TOTAL_EQUITY_DISTRIBUTIONS / EQUITY_AMOUNT).quantize(
            Decimal("0.0001"), ROUND_HALF_UP
        )
        assert computed == EXPECTED_TVPI, (
            f"TVPI {computed} != expected {EXPECTED_TVPI}"
        )

    def test_tvpi_greater_than_1(self):
        """Profitable investment — TVPI must exceed 1.0x."""
        assert EXPECTED_TVPI > Decimal("1.0")

    def test_equity_equals_purchase_minus_loan(self):
        assert EQUITY_AMOUNT == PURCHASE_PRICE - LOAN_AMOUNT

    def test_ltv_at_acquisition(self):
        ltv = LOAN_AMOUNT / PURCHASE_PRICE
        assert ltv == Decimal("0.65"), f"LTV {ltv} != 0.65"


# ═══════════════════════════════════════════════════════════════════════════
# LAYER 5: Waterfall tier math
# ═══════════════════════════════════════════════════════════════════════════

class TestGoldenPathWaterfall:
    """Validate waterfall tier allocations on golden path distributions."""

    def test_roc_returns_full_equity(self):
        """Tier 1: Return of capital — LP gets invested back."""
        distributable = TOTAL_EQUITY_DISTRIBUTIONS
        roc = min(distributable, EQUITY_AMOUNT)
        assert roc == EQUITY_AMOUNT

    def test_pref_on_remaining(self):
        """Tier 2: 8% simple preferred return on equity for 2 years."""
        pref = (EQUITY_AMOUNT * Decimal("0.08") * 2).quantize(Decimal("0.01"))
        remaining_after_roc = TOTAL_EQUITY_DISTRIBUTIONS - EQUITY_AMOUNT
        # Pref should be payable from remaining
        assert remaining_after_roc >= pref, (
            f"Not enough remaining ({remaining_after_roc}) to pay pref ({pref})"
        )

    def test_all_tiers_sum_to_distributable(self):
        """LP + GP allocations must equal total distributable."""
        distributable = TOTAL_EQUITY_DISTRIBUTIONS
        roc = EQUITY_AMOUNT
        pref = (EQUITY_AMOUNT * Decimal("0.08") * 2).quantize(Decimal("0.01"))
        excess = distributable - roc - pref
        gp_carry = (excess * Decimal("0.20")).quantize(Decimal("0.01"))
        lp_excess = (excess * Decimal("0.80")).quantize(Decimal("0.01"))

        total_allocated = roc + pref + gp_carry + lp_excess
        # Allow $1 rounding tolerance
        assert abs(total_allocated - distributable) < 2, (
            f"Tier sum {total_allocated} != distributable {distributable}"
        )

    def test_gp_gets_zero_if_no_excess(self):
        """If distributions = equity, GP carry = 0."""
        distributable = EQUITY_AMOUNT  # just return of capital
        roc = EQUITY_AMOUNT
        remaining = distributable - roc
        assert remaining == 0
        # GP gets nothing

    def test_lp_receives_roc_plus_pref_before_gp_carry(self):
        """LP must receive full ROC + pref before GP earns carry."""
        distributable = TOTAL_EQUITY_DISTRIBUTIONS
        roc = EQUITY_AMOUNT
        pref = (EQUITY_AMOUNT * Decimal("0.08") * 2).quantize(Decimal("0.01"))
        lp_priority = roc + pref
        # LP priority claims are fully satisfied
        assert distributable > lp_priority, "Not enough to cover LP priority"


# ═══════════════════════════════════════════════════════════════════════════
# LAYER 6: Cross-layer reconciliation invariants
# ═══════════════════════════════════════════════════════════════════════════

class TestCrossLayerInvariants:
    """Invariants that span multiple layers."""

    def test_no_cash_leak(self):
        """Every dollar of NCF + sale proceeds is accounted for."""
        total_in = TOTAL_OPERATING_NCF + NET_SALE
        assert total_in == TOTAL_EQUITY_DISTRIBUTIONS

    def test_fund_share_plus_partner_share_equals_total(self):
        """80% + 20% = 100% at every level."""
        fund_total = FUND_OPERATING_NCF + FUND_SALE_PROCEEDS
        partner_total = (TOTAL_OPERATING_NCF - FUND_OPERATING_NCF) + (NET_SALE - FUND_SALE_PROCEEDS)
        # Allow $2 rounding tolerance
        assert abs(fund_total + partner_total - TOTAL_EQUITY_DISTRIBUTIONS) < 3

    def test_quarterly_ncf_all_positive(self):
        """Golden path has no negative cash flow quarters."""
        for i, ncf in enumerate(NCF):
            assert ncf > 0, f"Q{i} NCF is negative: {ncf}"

    def test_sale_net_exceeds_equity(self):
        """Profitable exit — net sale alone exceeds equity invested."""
        assert NET_SALE > EQUITY_AMOUNT
