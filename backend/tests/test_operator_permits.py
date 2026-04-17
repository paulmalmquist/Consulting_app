"""Permit Tracker — per-permit days-over-median + funnel + impact roll-up."""

from __future__ import annotations

from uuid import UUID

from app.services.operator import _load_fixture, list_permits


ENV_ID = UUID("11111111-1111-4111-8111-111111111111")


def _reset_cache() -> None:
    _load_fixture.cache_clear()


def test_delayed_permits_surface_first_and_carry_impact():
    _reset_cache()
    board = list_permits(env_id=ENV_ID)
    permits = board["permits"]
    assert permits
    # Delayed permits must sort before on-track permits
    delay_flags = [p["delay_flag"] for p in permits]
    first_on_track = delay_flags.index(False) if False in delay_flags else len(permits)
    last_delayed = max(
        (i for i, flag in enumerate(delay_flags) if flag), default=-1
    )
    assert last_delayed < first_on_track
    # Every delayed permit must carry an impact
    for p in permits:
        if p["delay_flag"]:
            assert p["impact"] is not None, (
                f"delayed permit {p['permit_id']} must carry an impact block"
            )


def test_days_over_median_is_positive_for_delayed():
    _reset_cache()
    board = list_permits(env_id=ENV_ID)
    for p in board["permits"]:
        if p["delay_flag"]:
            assert p["days_in_stage"] > p["median_stage_days"], (
                f"{p['permit_id']} marked delayed but days_in_stage !> median"
            )
            assert p["days_over_median"] > 0


def test_funnel_counts_match_permit_stages():
    _reset_cache()
    board = list_permits(env_id=ENV_ID)
    funnel_total = sum(row["count"] for row in board["funnel"])
    assert funnel_total == len(board["permits"])


def test_totals_roll_up_matches_rows():
    _reset_cache()
    board = list_permits(env_id=ENV_ID)
    totals = board["totals"]
    assert totals["permit_count"] == len(board["permits"])
    delayed = [p for p in board["permits"] if p["delay_flag"]]
    assert totals["delayed_count"] == len(delayed)
    recomputed_impact = sum(
        float((p.get("impact") or {}).get("estimated_cost_usd") or 0) for p in delayed
    )
    assert totals["delayed_impact_usd"] == recomputed_impact


def test_permit_rows_carry_project_and_municipality_hrefs():
    _reset_cache()
    board = list_permits(env_id=ENV_ID)
    for p in board["permits"]:
        if p.get("project_id"):
            assert str(ENV_ID) in (p.get("href_project") or "")
        if p.get("municipality_id"):
            assert str(ENV_ID) in (p.get("href_municipality") or "")


def test_airport_electrical_rev3_is_visible_and_urgent():
    """The Action Queue hero story must appear in the permit board."""
    _reset_cache()
    board = list_permits(env_id=ENV_ID)
    row = next(
        (p for p in board["permits"] if p["permit_id"] == "prm-airport-elec-rev3"),
        None,
    )
    assert row is not None
    assert row["delay_flag"]
    assert row["impact"]["if_ignored"]["in_30_days"]["estimated_cost_usd"] >= 200_000
    # Narrative requires urgency
    assert row["impact"]["time_to_failure_days"] <= 14
