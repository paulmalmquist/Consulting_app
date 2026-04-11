"""Unit tests for the shared History Rhymes math services.

These tests are deliberately NOT in backend/tests/ because the services live
under skills/historyrhymes/services/ and are imported directly by the
Databricks notebooks (not through the FastAPI app). They're pure math — no
DB, no HTTP, no mocks needed.

Run with:
    python -m pytest skills/historyrhymes/services/test_shared_services.py -q

The FastAPI service (backend/app/services/history_rhymes_service.py) has its
OWN copy of the era-discount and Hoyt math for import-path independence.
Both copies must agree — the test `test_math_agrees_with_backend_copy` enforces
this until we consolidate.
"""

from __future__ import annotations

from datetime import date

import pytest

from skills.historyrhymes.services.era_discount import (
    ERA_DISCOUNT_FLOOR,
    ERA_DISCOUNT_RULES,
    apply_structural_era_discount,
)
from skills.historyrhymes.services.hoyt_cycle import (
    HOYT_CYCLE_YEARS,
    HOYT_PEAK_PROXIMITY_THRESHOLD,
    HOYT_TROUGH_ANCHOR,
    hoyt_cycle_position,
    hoyt_phase_for_date,
    hoyt_phase_label,
)
from skills.historyrhymes.services.state_vector_encoder import (
    QUANT_BLOCK_DIM,
    STATE_VECTOR_DIM,
    TEXT_BLOCK_DIM,
    current_modality_flags,
    encode_state_vector,
)


# ── hoyt_cycle ────────────────────────────────────────────────────────────────


def test_hoyt_anchor_returns_zero():
    assert hoyt_cycle_position(HOYT_TROUGH_ANCHOR) == pytest.approx(0.0, abs=0.01)


def test_hoyt_plus_one_year():
    assert hoyt_cycle_position(date(2010, 3, 1)) == pytest.approx(1.0, abs=0.01)


def test_hoyt_april_2026_is_late_peak():
    pos = hoyt_cycle_position(date(2026, 4, 10))
    assert 17.0 < pos < 17.5
    assert pos > HOYT_PEAK_PROXIMITY_THRESHOLD


def test_hoyt_wraps_at_18_years():
    # Going one day past 18 years (leap-year drift aside) should wrap.
    pos = hoyt_cycle_position(date(2027, 3, 15))
    assert 0.0 <= pos < 0.1


def test_phase_labels_across_cycle():
    assert hoyt_phase_label(2.0) == "recovery"
    assert hoyt_phase_label(6.5) == "expansion"
    assert hoyt_phase_label(11.0) == "mid_cycle"
    assert hoyt_phase_label(15.5) == "peak"
    assert hoyt_phase_label(17.5) == "bust"


def test_phase_boundaries_are_inclusive_below_exclusive_above():
    # At exactly 4.0 → expansion (not recovery)
    assert hoyt_phase_label(4.0) == "expansion"
    assert hoyt_phase_label(9.0) == "mid_cycle"
    assert hoyt_phase_label(14.0) == "peak"
    assert hoyt_phase_label(17.0) == "bust"


def test_hoyt_phase_for_date_convenience():
    pos, phase = hoyt_phase_for_date(date(2026, 4, 10))
    assert 17.0 < pos < 17.5
    assert phase == "bust"  # Per Section 5.3 defaults, 17.0+ is 'bust'


def test_cycle_length_constant():
    # Invariant: wrapping is always at HOYT_CYCLE_YEARS
    assert HOYT_CYCLE_YEARS == 18.0


# ── era_discount ──────────────────────────────────────────────────────────────


def test_era_discount_no_modalities_no_change():
    assert apply_structural_era_discount(0.80, 1973, current_state={}) == pytest.approx(0.80)


def test_era_discount_1973_compounds_four_multipliers():
    score = apply_structural_era_discount(
        0.80,
        1973,
        current_state={"vix_z": 1, "hy_oas_z": 1, "btc_z": 1, "perp_funding_z": 1},
    )
    # 0.80 * 0.85 * 0.90 * 0.80 * 0.90 = 0.44064
    assert score == pytest.approx(0.44064, abs=0.001)


def test_era_discount_2010_only_perp_missing():
    # 2010 ≥ 2009 (btc), so btc discount doesn't apply. Only perp (< 2018).
    score = apply_structural_era_discount(
        0.80,
        2010,
        current_state={"vix_z": 1, "hy_oas_z": 1, "btc_z": 1, "perp_funding_z": 1},
    )
    assert score == pytest.approx(0.72, abs=0.001)  # 0.80 * 0.90


def test_era_discount_2020_nothing_applies():
    # 2020 is after all thresholds → no discount
    score = apply_structural_era_discount(
        0.80,
        2020,
        current_state={"vix_z": 1, "hy_oas_z": 1, "btc_z": 1, "perp_funding_z": 1},
    )
    assert score == pytest.approx(0.80)


def test_era_discount_floor_never_exceeded():
    # Even if the base score is 1.0 and all four discounts apply, the result
    # should be >= floor (0.50)
    score = apply_structural_era_discount(
        1.0,
        1973,
        current_state={"vix_z": 1, "hy_oas_z": 1, "btc_z": 1, "perp_funding_z": 1},
    )
    assert score >= ERA_DISCOUNT_FLOOR
    assert score <= 1.0


def test_era_discount_modality_none_means_no_discount():
    # If VIX isn't measured today (current_state[vix_z] is None), no VIX discount
    # applies even on a 1973 episode.
    score = apply_structural_era_discount(
        0.80,
        1973,
        current_state={"vix_z": None, "hy_oas_z": None, "btc_z": None, "perp_funding_z": None},
    )
    assert score == pytest.approx(0.80)


def test_era_discount_rule_count():
    # Sanity: if someone adds/removes a rule, tests should catch it
    assert len(ERA_DISCOUNT_RULES) == 4


# ── state_vector_encoder ──────────────────────────────────────────────────────


def test_state_vector_dim_constants():
    assert QUANT_BLOCK_DIM == 128
    assert TEXT_BLOCK_DIM == 128
    assert STATE_VECTOR_DIM == 256


def test_encode_state_vector_returns_256_floats():
    features = {"vix_spot": 18.0, "sp500_return_1m": 0.02}
    vec = encode_state_vector(features, narrative_text="")
    assert isinstance(vec, list)
    assert len(vec) == 256
    assert all(isinstance(x, float) for x in vec)


def test_encode_state_vector_deterministic_with_empty_text():
    features = {"vix_spot": 18.0, "sp500_return_1m": 0.02}
    vec1 = encode_state_vector(features, narrative_text="")
    vec2 = encode_state_vector(features, narrative_text="")
    assert vec1 == vec2


def test_encode_state_vector_quant_half_is_l2_normalized():
    # With empty text the text half is all zeros, so the quant half's L2 norm
    # should be ~1.0
    features = {"vix_spot": 18.0, "hy_credit_spread": 3.5}
    vec = encode_state_vector(features, narrative_text="")
    quant_half = vec[:128]
    norm = sum(x * x for x in quant_half) ** 0.5
    assert 0.99 < norm < 1.01


def test_encode_state_vector_missing_features_become_zero():
    # Sparse feature dict → missing slots are 0
    vec = encode_state_vector({"vix_spot": 1.0}, narrative_text="")
    # With only one non-zero feature, the L2-normalized quant half has only
    # one non-zero element (at the vix_spot slot position) with value 1.0
    quant_half = vec[:128]
    nonzero = [x for x in quant_half if x != 0]
    assert len(nonzero) == 1
    assert nonzero[0] == pytest.approx(1.0)


def test_encode_state_vector_nan_treated_as_zero():
    features = {"vix_spot": float("nan"), "sp500_return_1m": 0.05}
    vec = encode_state_vector(features, narrative_text="")
    # vix_spot slot should be 0 (NaN → 0); sp500_return_1m slot should be 1.0 after L2
    quant_half = vec[:128]
    nonzero = [x for x in quant_half if x != 0]
    assert len(nonzero) == 1


def test_current_modality_flags_none_when_feature_missing():
    flags = current_modality_flags({})
    assert flags["vix_z"] is None
    assert flags["hy_oas_z"] is None
    assert flags["btc_z"] is None
    assert flags["perp_funding_z"] is None


def test_current_modality_flags_present_when_feature_set():
    flags = current_modality_flags({
        "vix_spot": 18.0,
        "hy_credit_spread": 3.5,
        "btc_price_usd": 60000,
        # perp_funding_rate intentionally missing
    })
    assert flags["vix_z"] == 18.0
    assert flags["hy_oas_z"] == 3.5
    assert flags["btc_z"] == 60000
    assert flags["perp_funding_z"] is None


def test_current_modality_flags_zero_treated_as_none():
    # An explicit zero shouldn't trigger an era discount — it means the
    # feature was unavailable that day, not that it was actually zero.
    flags = current_modality_flags({"vix_spot": 0.0})
    assert flags["vix_z"] is None
