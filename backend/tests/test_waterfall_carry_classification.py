"""Carry classification regression tests — Bug 3 guardrails.

Three guardrails that would have caught Bug 3 the moment it was introduced:

  1. Carry isolation — LP residual (tier_4_carry_split_lp) must NEVER be
     counted as carry. Only tier_3_gp_catch_up + tier_4_carry_split_gp count.

  2. Sum constraint — carry cannot exceed fund distributable; carry also
     cannot exceed carry_rate × profit (or very close to it). Catches
     substring bugs, double-counting, and misclassification.

  3. Unknown tier_code fails closed — if the engine ever emits a tier_code
     not in _TIER_TYPE_MAP, the classification function must return None
     (fail-closed per SYSTEM_RULES_AUTHORITATIVE_STATE Rule 3), forcing
     anyone adding a new tier to consciously classify it.

Related regression target: phase_B7_step7_gate_stop.md, commit 490fbb1e.
"""
from __future__ import annotations

import os
import sys
import types
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *a, **kw: None
    psycopg_stub.Connection = object
    psycopg_stub.rows = types.SimpleNamespace(dict_row=None)
    sys.modules["psycopg"] = psycopg_stub

if "dotenv" not in sys.modules:
    dotenv_stub = types.ModuleType("dotenv")
    dotenv_stub.load_dotenv = lambda *a, **kw: None
    sys.modules["dotenv"] = dotenv_stub


# ---------------------------------------------------------------------------
# Guardrail 1 — carry isolation (THE test that would have caught Bug 3)
# ---------------------------------------------------------------------------

def test_carry_excludes_lp_tier4_split_BUG_3_REGRESSION():
    """Bug 3: substring matching treated tier_4_carry_split_lp as carry.
    This test pins that ONLY tier_4_carry_split_gp (+ tier_3_gp_catch_up)
    count as carry. LP's tier_4_carry_split_lp is residual participation,
    NOT carry, and must be excluded.

    IGF VII 2026Q2 pre-fix:
      tier_4_carry_split_gp = $177,376,257.39  (real carry)
      tier_4_carry_split_lp = $709,505,029.58  (LP residual — NOT carry)
    Pre-fix carry = $886,881,286.97 (wrong, substring match)
    Post-fix carry = $177,376,257.39 (right, exact-code match)
    """
    from app.services import re_fund_metrics

    mock_result = {
        "results": [
            {"tier_code": "tier_4_carry_split_gp", "amount": "177376257.39"},  # ← counts
            {"tier_code": "tier_4_carry_split_lp", "amount": "709505029.58"},  # ← MUST NOT count
            {"tier_code": "tier_1_return_of_capital", "amount": "559492243.93"},  # return of capital
        ]
    }
    with patch("app.services.re_waterfall_runtime.run_waterfall", return_value=mock_result):
        carry = re_fund_metrics._compute_waterfall_carry(
            fund_id=uuid4(),
            quarter="2026Q2",
            gross_return=Decimal("886881286.99"),
            total_called=Decimal("695000000"),
        )
    assert carry == Decimal("177376257.39"), (
        f"BUG 3 REGRESSION: carry must be GP only ($177.4M), not GP+LP ($886.9M). Got {carry}"
    )


def test_carry_includes_tier3_catchup():
    """Catch-up is GP carry — tier_3_gp_catch_up MUST count toward carry."""
    from app.services import re_fund_metrics

    mock_result = {
        "results": [
            {"tier_code": "tier_3_gp_catch_up",   "amount": "50000000.00"},  # ← counts
            {"tier_code": "tier_4_carry_split_gp", "amount": "100000000.00"},  # ← counts
            {"tier_code": "tier_4_carry_split_lp", "amount": "400000000.00"},  # ← MUST NOT count
        ]
    }
    with patch("app.services.re_waterfall_runtime.run_waterfall", return_value=mock_result):
        carry = re_fund_metrics._compute_waterfall_carry(
            fund_id=uuid4(),
            quarter="2026Q2",
            gross_return=Decimal("550000000"),
            total_called=Decimal("200000000"),
        )
    assert carry == Decimal("150000000.00"), f"expected $150M (50M catchup + 100M GP); got {carry}"


def test_carry_excludes_pref_and_roc_tiers():
    """Preferred return and return-of-capital are not carry under any classification."""
    from app.services import re_fund_metrics

    mock_result = {
        "results": [
            {"tier_code": "tier_1_return_of_capital", "amount": "100000000"},
            {"tier_code": "tier_2_preferred_return", "amount": "8000000"},
            {"tier_code": "tier_5_rounding_adjustment", "amount": "0.03"},
        ]
    }
    with patch("app.services.re_waterfall_runtime.run_waterfall", return_value=mock_result):
        carry = re_fund_metrics._compute_waterfall_carry(
            fund_id=uuid4(),
            quarter="2026Q2",
            gross_return=Decimal("0"),
            total_called=Decimal("100000000"),
        )
    assert carry == Decimal("0.00"), f"no carry-qualifying tiers present; got {carry}"


# ---------------------------------------------------------------------------
# Guardrail 2 — sum constraint
# ---------------------------------------------------------------------------

def test_carry_never_exceeds_distributable():
    """Structural guardrail: regardless of tier-code classification, carry
    can never exceed the fund's total distributable amount. If it does,
    either the classification is wrong (double-count) or the engine leaked
    cash."""
    from app.services import re_fund_metrics

    distributable = Decimal("1000000000")
    mock_result = {
        "results": [
            {"tier_code": "tier_1_return_of_capital", "amount": "500000000"},
            {"tier_code": "tier_4_carry_split_gp", "amount": "100000000"},
            {"tier_code": "tier_4_carry_split_lp", "amount": "400000000"},
        ],
        "total_distributable": str(distributable),
    }
    with patch("app.services.re_waterfall_runtime.run_waterfall", return_value=mock_result):
        carry = re_fund_metrics._compute_waterfall_carry(
            fund_id=uuid4(),
            quarter="2026Q2",
            gross_return=Decimal("500000000"),
            total_called=Decimal("500000000"),
        )
    assert carry is not None
    assert carry <= distributable, f"carry {carry} exceeds distributable {distributable}"


def test_carry_approximates_carry_rate_times_profit_european_waterfall():
    """In a standard European waterfall with no pref/catchup activating,
    GP carry should be approximately carry_rate × profit where profit =
    distributable − return_of_capital. Catches misclassification by
    sanity-checking the economic magnitude.

    Scenario: $1B distributable, $500M ROC, $500M profit, 80/20 split →
    GP carry should be $100M ± tolerance.
    """
    from app.services import re_fund_metrics

    mock_result = {
        "results": [
            {"tier_code": "tier_1_return_of_capital", "amount": "500000000"},
            {"tier_code": "tier_4_carry_split_gp", "amount": "100000000"},  # 20% of $500M profit
            {"tier_code": "tier_4_carry_split_lp", "amount": "400000000"},  # 80% of $500M profit
        ]
    }
    profit = Decimal("500000000")
    expected_carry = Decimal("0.20") * profit

    with patch("app.services.re_waterfall_runtime.run_waterfall", return_value=mock_result):
        carry = re_fund_metrics._compute_waterfall_carry(
            fund_id=uuid4(),
            quarter="2026Q2",
            gross_return=profit,
            total_called=Decimal("500000000"),
        )
    # 0.1% tolerance on the economic magnitude.
    tolerance = expected_carry * Decimal("0.001")
    assert abs(carry - expected_carry) <= tolerance, (
        f"carry {carry} diverges from carry_rate × profit {expected_carry} by more than tolerance"
    )


# ---------------------------------------------------------------------------
# Guardrail 3 — unknown tier_code fails closed
# ---------------------------------------------------------------------------

def test_unknown_tier_code_fails_closed():
    """If a new tier code is added to run_us_waterfall without a
    corresponding entry in _TIER_TYPE_MAP, _compute_waterfall_carry must
    return None (fail-closed). Forces explicit classification on every
    engine change — prevents a future Bug 4."""
    from app.services import re_fund_metrics

    mock_result = {
        "results": [
            {"tier_code": "tier_6_brand_new_unclassified_tier", "amount": "999000000"},
            {"tier_code": "tier_4_carry_split_gp", "amount": "100000000"},
        ]
    }
    with patch("app.services.re_waterfall_runtime.run_waterfall", return_value=mock_result):
        carry = re_fund_metrics._compute_waterfall_carry(
            fund_id=uuid4(),
            quarter="2026Q2",
            gross_return=Decimal("50000000"),
            total_called=Decimal("100000000"),
        )
    # Unknown tier → classification function raises internally → outer except
    # catches it and returns None (fail-closed contract).
    assert carry is None, (
        f"unknown tier_code must fail closed to None, not silently partial-sum; got {carry}"
    )


# ---------------------------------------------------------------------------
# Guardrail — classification map exhaustiveness
# ---------------------------------------------------------------------------

def test_tier_type_map_covers_every_engine_tier_code():
    """Any tier_code the engine emits must be classified. Detects when a
    future engine change adds a tier but forgets to update the map."""
    import re
    from pathlib import Path
    from app.services.re_fund_metrics import _TIER_TYPE_MAP

    engine_src = Path(__file__).parent.parent / "app" / "finance" / "waterfall_engine.py"
    source = engine_src.read_text()
    # Find every string-literal tier_code in the engine.
    engine_tier_codes = set(re.findall(r'tier_code=["\'](tier_\w+)["\']', source))
    # Also the positional first-arg form: _tier_alloc("tier_N_xxx", ...)
    engine_tier_codes |= set(re.findall(r'_tier_alloc\(\s*["\'](tier_\w+)["\']', source))

    assert engine_tier_codes, "expected to find at least one tier_code literal in waterfall_engine.py"

    missing = engine_tier_codes - set(_TIER_TYPE_MAP.keys())
    assert not missing, (
        f"_TIER_TYPE_MAP missing classification for tier_code(s): {missing}. "
        f"Every engine-emitted tier must be classified."
    )


# ---------------------------------------------------------------------------
# Guardrail — golden IGF VII exact carry
# ---------------------------------------------------------------------------

def test_igf7_expected_carry_exact():
    """Anchored to the corrected IGF VII 2026Q2 shadow run e95fe4f7.
    This becomes the final gate before promotion: anyone re-running the
    waterfall with the fixed engine + fixed ledger + fixed carry classification
    must see this exact value. Pins $177,376,257.39 as the known-good carry."""
    from app.services import re_fund_metrics

    IGF7_SHADOW_RESULTS = {
        "results": [
            {"tier_code": "tier_1_return_of_capital", "amount": "559492243.93"},
            {"tier_code": "tier_4_carry_split_gp",    "amount": "177376257.39"},
            {"tier_code": "tier_4_carry_split_lp",    "amount": "709505029.58"},
        ]
    }
    with patch("app.services.re_waterfall_runtime.run_waterfall", return_value=IGF7_SHADOW_RESULTS):
        carry = re_fund_metrics._compute_waterfall_carry(
            fund_id=uuid4(),
            quarter="2026Q2",
            gross_return=Decimal("886881286.97"),
            total_called=Decimal("695000000"),
        )
    assert carry == Decimal("177376257.39"), (
        f"Gate: IGF VII 2026Q2 carry must be $177,376,257.39 (GP tier 4 only). Got {carry}"
    )
