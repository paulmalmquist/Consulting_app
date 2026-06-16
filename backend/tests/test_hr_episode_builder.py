"""Pure-compute tests for the episode feature builder (no DB, no network).

Uses a deterministic fixture series_provider so every feature/target is exact and
the no-lookahead contract is asserted directly. Run from backend/:
    pytest --noconftest tests/test_hr_episode_builder.py
"""

from __future__ import annotations

from datetime import date

import pytest

from app.services.hr_features.episode_builder import (
    EpisodeDescriptor,
    compute_episode_rows,
)

AS_OF = date(2007, 6, 1)


def _monthly(start_year, start_month, n, fn):
    """n monthly points (first-of-month) ascending, value = fn(i)."""
    pts = []
    y, m = start_year, start_month
    for i in range(n):
        pts.append((date(y, m, 1), float(fn(i))))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return pts


def fixture_provider(series_ids, start, end):
    """Crafted series. Feature inputs span 30 months ending at AS_OF; target inputs
    span forward from AS_OF. A wild post-AS_OF spread point is included to prove
    features ignore the future (no-lookahead)."""
    # 30 monthly points 2005-01 .. 2007-06 (i=29 -> 2007-06)
    dgs2 = _monthly(2005, 1, 30, lambda i: 4.0 + 0.02 * i)
    dgs10 = _monthly(2005, 1, 30, lambda i: 4.5 + 0.01 * i)
    # Leak trap: a post-as_of month with a huge spread; features must ignore it.
    dgs10.append((date(2007, 7, 1), 99.0))
    dgs2.append((date(2007, 7, 1), 0.0))

    credit = _monthly(2005, 1, 30, lambda i: 3.0 + 0.05 * i)   # velocity +0.05
    houst = _monthly(2005, 1, 30, lambda i: 1500 - 10 * i)     # velocity -10

    # SP500 forward from AS_OF: dip to 1200 then recover (drawdown ~ -0.2105)
    spx_vals = [1500, 1520, 1480, 1440, 1300, 1200, 1350, 1450, 1500, 1550, 1560, 1570, 1580, 1590]
    spx = _monthly(2007, 6, len(spx_vals), lambda i: spx_vals[i])
    # USREC forward: recession starts 2007-12
    usrec = _monthly(2007, 6, 14, lambda i: 1.0 if i >= 6 else 0.0)

    return {"DGS10": dgs10, "DGS2": dgs2, "BAMLC0A0CM": credit,
            "HOUST": houst, "SP500": spx, "USREC": usrec}


@pytest.fixture
def rows():
    ep = EpisodeDescriptor(episode_id="00000000-0000-0000-0000-000000000001",
                           name="Fixture GFC", as_of=AS_OF)
    return compute_episode_rows(ep, fixture_provider, provenance="fixture")


def _feat(rows, fid):
    return next(r for r in rows["features"] if r.feature_id == fid)


def _tgt(rows, name):
    return next(r for r in rows["targets"] if r.target_name == name)


def test_all_features_non_null(rows):
    for r in rows["features"]:
        assert r.null_reason is None, f"{r.feature_id} unexpectedly null: {r.null_reason}"


def test_yield_curve_family_values(rows):
    # spread at i=29: dgs10=4.79, dgs2=4.58 -> 0.21
    assert _feat(rows, "yc_slope").value == pytest.approx(0.21, abs=1e-9)
    assert _feat(rows, "yc_velocity").value == pytest.approx(-0.01, abs=1e-9)  # linear, -0.01/mo
    assert _feat(rows, "yc_acceleration").value == pytest.approx(0.0, abs=1e-9)
    assert _feat(rows, "yc_regime").value_label == "flat"   # 0 <= 0.21 < 0.5
    assert _feat(rows, "yc_zscore").value is not None


def test_no_lookahead_ignores_future_spread(rows):
    # The 2007-07 leak point (spread 99) is after AS_OF; yc_slope must stay 0.21.
    assert _feat(rows, "yc_slope").value == pytest.approx(0.21, abs=1e-9)


def test_credit_and_housing_velocity(rows):
    assert _feat(rows, "credit_spread_velocity").value == pytest.approx(0.05, abs=1e-9)
    assert _feat(rows, "housing_velocity").value == pytest.approx(-10.0, abs=1e-9)


def test_targets(rows):
    # base 1500 (2007-06), end at/after as_of+90d (2007-09) = 1440 -> -0.04
    assert _tgt(rows, "outcome_3m").value == pytest.approx(1440 / 1500 - 1, abs=1e-9)
    # worst drawdown: peak 1520 -> trough 1200 = -0.210526...
    assert _tgt(rows, "drawdown").value == pytest.approx(1200 / 1520 - 1, abs=1e-9)
    # USREC hits 1 within 365d
    assert _tgt(rows, "recession_flag").value == 1.0


def test_deterministic_inputs_hash():
    ep = EpisodeDescriptor("id", "Fixture GFC", AS_OF)
    a = compute_episode_rows(ep, fixture_provider, "fixture")
    b = compute_episode_rows(ep, fixture_provider, "fixture")
    assert a["features"][0].inputs_hash == b["features"][0].inputs_hash
    assert a["features"][0].inputs_hash != ""


def test_fail_closed_when_series_missing():
    ep = EpisodeDescriptor("id", "Empty", AS_OF)
    empty = compute_episode_rows(ep, lambda ids, s, e: {}, "fixture")
    # every feature null with a reason, every target null with a reason — no crash
    assert all(r.value is None and r.null_reason for r in empty["features"])
    assert all(t.value is None and t.null_reason for t in empty["targets"])
