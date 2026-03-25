"""Tests for RE valuation pure math functions.

These tests require NO database — they test stateless, deterministic functions.
Golden fixtures ensure historical reproducibility.
"""

import pytest
from decimal import Decimal

from app.services.re_math import (
    calculate_gpr,
    calculate_vacancy_loss,
    calculate_egi,
    calculate_noi,
    calculate_value_direct_cap,
    calculate_value_dcf,
    calculate_value_blended,
    calculate_equity_value,
    calculate_nav_equity,
    calculate_ltv,
    calculate_dscr,
    calculate_debt_yield,
    calculate_irr,
    compute_input_hash,
    compute_sensitivities,
    generate_amortization_schedule,
)


# ---------------------------------------------------------------------------
# Golden fixture: hand-calculated base case
# Asset: 200-unit multifamily, $1,500/unit/month, 5% vacancy
# ---------------------------------------------------------------------------
GOLDEN = {
    "units": 200,
    "rent_per_unit": 1500 * 12,  # annualized
    "vacancy_rate": 0.05,
    "other_income": 50000,
    "operating_expenses": 1_400_000,
    "cap_rate": 0.055,
    "loan_balance": 20_000_000,
    "annual_debt_service": 1_200_000,
    # Hand-calculated expected values:
    "expected_gpr": Decimal("3600000.00"),           # 200 * 18000
    "expected_vacancy_loss": Decimal("180000.00"),   # 3,600,000 * 0.05
    "expected_egi": Decimal("3470000.00"),            # 3,600,000 - 180,000 + 50,000
    "expected_noi": Decimal("2070000.00"),            # 3,470,000 - 1,400,000
    "expected_value_cap": Decimal("37636363.64"),     # 2,070,000 / 0.055
    "expected_equity": Decimal("17636363.64"),        # 37,636,363.64 - 20,000,000
    "expected_dscr": Decimal("1.7250"),               # 2,070,000 / 1,200,000
    "expected_debt_yield": Decimal("0.103500"),       # 2,070,000 / 20,000,000
    "expected_ltv": Decimal("0.531401"),              # 20,000,000 / 37,636,363.64
}


class TestOperatingMetrics:
    """Test GPR, vacancy, EGI, NOI calculations."""

    def test_calculate_gpr(self):
        result = calculate_gpr(Decimal(GOLDEN["units"]), Decimal(GOLDEN["rent_per_unit"]))
        assert result == GOLDEN["expected_gpr"]

    def test_calculate_vacancy_loss(self):
        result = calculate_vacancy_loss(GOLDEN["expected_gpr"], Decimal(str(GOLDEN["vacancy_rate"])))
        assert result == GOLDEN["expected_vacancy_loss"]

    def test_calculate_egi(self):
        result = calculate_egi(
            GOLDEN["expected_gpr"],
            GOLDEN["expected_vacancy_loss"],
            Decimal(str(GOLDEN["other_income"])),
        )
        assert result == GOLDEN["expected_egi"]

    def test_calculate_noi(self):
        result = calculate_noi(GOLDEN["expected_egi"], Decimal(str(GOLDEN["operating_expenses"])))
        assert result == GOLDEN["expected_noi"]


class TestValuationMethods:
    """Test direct cap, DCF, and blended valuation."""

    def test_direct_cap(self):
        result = calculate_value_direct_cap(
            GOLDEN["expected_noi"], Decimal(str(GOLDEN["cap_rate"]))
        )
        assert result == GOLDEN["expected_value_cap"]

    def test_direct_cap_zero_cap_rate_raises(self):
        with pytest.raises(ValueError, match="positive"):
            calculate_value_direct_cap(Decimal("1000000"), Decimal("0"))

    def test_direct_cap_negative_cap_rate_raises(self):
        with pytest.raises(ValueError, match="positive"):
            calculate_value_direct_cap(Decimal("1000000"), Decimal("-0.05"))

    def test_dcf_basic(self):
        """DCF produces a positive value and is different from direct cap."""
        result = calculate_value_dcf(
            base_noi=Decimal("2070000"),
            rent_growth=Decimal("0.02"),
            expense_growth=Decimal("0.03"),
            vacancy_assumption=Decimal("0.05"),
            exit_cap_rate=Decimal("0.06"),
            discount_rate=Decimal("0.08"),
        )
        assert result > 0
        # DCF with growth should differ from simple cap
        assert result != GOLDEN["expected_value_cap"]

    def test_dcf_zero_exit_cap_raises(self):
        with pytest.raises(ValueError, match="Exit cap rate"):
            calculate_value_dcf(
                Decimal("1000000"), Decimal("0.02"), Decimal("0.03"),
                Decimal("0.05"), Decimal("0"), Decimal("0.08"),
            )

    def test_blended_value(self):
        v_cap = Decimal("37636363.64")
        v_dcf = Decimal("35000000.00")
        result = calculate_value_blended(v_cap, v_dcf, Decimal("0.7"), Decimal("0.3"))
        expected = (v_cap * Decimal("0.7") + v_dcf * Decimal("0.3")).quantize(Decimal("0.01"))
        assert result == expected

    def test_blended_100pct_cap(self):
        """100% cap weight should return cap value."""
        v_cap = Decimal("37636363.64")
        v_dcf = Decimal("35000000.00")
        result = calculate_value_blended(v_cap, v_dcf, Decimal("1.0"), Decimal("0.0"))
        assert result == v_cap

    def test_blended_100pct_dcf(self):
        v_cap = Decimal("37636363.64")
        v_dcf = Decimal("35000000.00")
        result = calculate_value_blended(v_cap, v_dcf, Decimal("0.0"), Decimal("1.0"))
        assert result == v_dcf


class TestDebtMetrics:
    """Test DSCR, debt yield, LTV, equity."""

    def test_equity_value(self):
        result = calculate_equity_value(GOLDEN["expected_value_cap"], Decimal(str(GOLDEN["loan_balance"])))
        assert result == GOLDEN["expected_equity"]

    def test_nav_equity_without_pref_deduction(self):
        result = calculate_nav_equity(GOLDEN["expected_equity"])
        assert result == GOLDEN["expected_equity"]

    def test_nav_equity_with_pref_deduction(self):
        result = calculate_nav_equity(GOLDEN["expected_equity"], Decimal("500000"), deduct_pref=True)
        assert result == GOLDEN["expected_equity"] - Decimal("500000")

    def test_dscr(self):
        result = calculate_dscr(GOLDEN["expected_noi"], Decimal(str(GOLDEN["annual_debt_service"])))
        assert result == GOLDEN["expected_dscr"]

    def test_dscr_zero_ds_raises(self):
        with pytest.raises(ValueError, match="positive"):
            calculate_dscr(Decimal("1000000"), Decimal("0"))

    def test_debt_yield(self):
        result = calculate_debt_yield(GOLDEN["expected_noi"], Decimal(str(GOLDEN["loan_balance"])))
        assert result == GOLDEN["expected_debt_yield"]

    def test_ltv(self):
        result = calculate_ltv(Decimal(str(GOLDEN["loan_balance"])), GOLDEN["expected_value_cap"])
        assert result == GOLDEN["expected_ltv"]


class TestIRR:
    """Test IRR calculations."""

    def test_simple_irr(self):
        """Invest 100, get back 121 after 2 years => ~10% IRR."""
        cashflows = [(0.0, -100), (2.0, 121)]
        irr = calculate_irr(cashflows)
        assert irr is not None
        assert abs(irr - 0.10) < 0.001

    def test_irr_with_interim_cashflows(self):
        """Invest 1M, get 80K/yr for 5 years + 1.1M exit."""
        cashflows = [
            (0.0, -1_000_000),
            (1.0, 80_000),
            (2.0, 80_000),
            (3.0, 80_000),
            (4.0, 80_000),
            (5.0, 1_180_000),
        ]
        irr = calculate_irr(cashflows)
        assert irr is not None
        assert 0.05 < irr < 0.15

    def test_irr_deterministic(self):
        """Same inputs always produce same IRR."""
        cashflows = [(0.0, -500_000), (3.0, 750_000)]
        irr1 = calculate_irr(cashflows)
        irr2 = calculate_irr(cashflows)
        assert irr1 == irr2

    def test_irr_none_for_empty(self):
        assert calculate_irr([]) is None
        assert calculate_irr([(0.0, -100)]) is None


class TestSensitivities:
    """Test sensitivity analysis."""

    def test_sensitivities_contain_base_case(self):
        result = compute_sensitivities(
            Decimal("2070000"), Decimal("20000000"),
            Decimal("1200000"), Decimal("0.055"),
        )
        assert "cap_rate_sensitivity" in result
        base = [s for s in result["cap_rate_sensitivity"] if s["cap_rate_delta_bps"] == 0]
        assert len(base) == 1
        assert Decimal(base[0]["implied_value"]) == GOLDEN["expected_value_cap"]

    def test_higher_cap_rate_lowers_value(self):
        result = compute_sensitivities(
            Decimal("2070000"), Decimal("20000000"),
            Decimal("1200000"), Decimal("0.055"),
        )
        base = [s for s in result["cap_rate_sensitivity"] if s["cap_rate_delta_bps"] == 0][0]
        shock = [s for s in result["cap_rate_sensitivity"] if s["cap_rate_delta_bps"] == 100][0]
        assert Decimal(shock["implied_value"]) < Decimal(base["implied_value"])


class TestAmortization:
    """Test amortization schedule generation."""

    def test_amort_schedule_length(self):
        schedule = generate_amortization_schedule(
            Decimal("1000000"), Decimal("0.05"), 30, 10
        )
        assert len(schedule) == 120  # 10 years * 12 months

    def test_amort_balance_decreasing(self):
        schedule = generate_amortization_schedule(
            Decimal("1000000"), Decimal("0.05"), 30, 10
        )
        for i in range(1, len(schedule)):
            assert schedule[i]["ending_balance"] <= schedule[i - 1]["ending_balance"]

    def test_io_period(self):
        schedule = generate_amortization_schedule(
            Decimal("1000000"), Decimal("0.05"), 30, 10, io_period_months=24
        )
        # First 24 months: zero principal
        for row in schedule[:24]:
            assert row["scheduled_principal"] == Decimal("0")
        # Month 25: principal should be positive
        assert schedule[24]["scheduled_principal"] > 0


class TestInputHash:
    """Test deterministic input hashing."""

    def test_same_inputs_same_hash(self):
        data = {"noi": "2070000", "cap_rate": "0.055", "asset_id": "abc-123"}
        h1 = compute_input_hash(data)
        h2 = compute_input_hash(data)
        assert h1 == h2

    def test_different_inputs_different_hash(self):
        h1 = compute_input_hash({"noi": "2070000"})
        h2 = compute_input_hash({"noi": "2070001"})
        assert h1 != h2

    def test_key_order_irrelevant(self):
        """Hash is canonical — key order doesn't matter."""
        h1 = compute_input_hash({"a": "1", "b": "2"})
        h2 = compute_input_hash({"b": "2", "a": "1"})
        assert h1 == h2


class TestDeterminism:
    """Verify all pure functions are fully deterministic."""

    def test_full_valuation_pipeline_deterministic(self):
        """Run the entire pipeline twice — must get identical results."""
        def _run():
            gpr = calculate_gpr(Decimal("200"), Decimal("18000"))
            vac = calculate_vacancy_loss(gpr, Decimal("0.05"))
            egi = calculate_egi(gpr, vac, Decimal("50000"))
            noi = calculate_noi(egi, Decimal("1400000"))
            val = calculate_value_direct_cap(noi, Decimal("0.055"))
            eq = calculate_equity_value(val, Decimal("20000000"))
            nav = calculate_nav_equity(eq)
            dscr = calculate_dscr(noi, Decimal("1200000"))
            dy = calculate_debt_yield(noi, Decimal("20000000"))
            ltv = calculate_ltv(Decimal("20000000"), val)
            sens = compute_sensitivities(noi, Decimal("20000000"), Decimal("1200000"), Decimal("0.055"))
            return {
                "gpr": gpr, "vac": vac, "egi": egi, "noi": noi,
                "val": val, "eq": eq, "nav": nav,
                "dscr": dscr, "dy": dy, "ltv": ltv,
                "sens": sens,
            }

        r1 = _run()
        r2 = _run()
        for key in r1:
            assert r1[key] == r2[key], f"Non-deterministic result for {key}"

    def test_golden_fixture_values_unchanged(self):
        """Golden values must match — catches regressions in math."""
        gpr = calculate_gpr(Decimal("200"), Decimal("18000"))
        assert gpr == GOLDEN["expected_gpr"]
        noi = calculate_noi(
            calculate_egi(gpr, calculate_vacancy_loss(gpr, Decimal("0.05")), Decimal("50000")),
            Decimal("1400000"),
        )
        assert noi == GOLDEN["expected_noi"]
        val = calculate_value_direct_cap(noi, Decimal("0.055"))
        assert val == GOLDEN["expected_value_cap"]
