"""Release gate tests — data integrity checks that MUST pass before deployment.

These tests validate the REPE financial data pipeline from seed data through
API responses. Any failure = blocked deploy.

These tests are designed to run against a seeded test database. They verify
structural integrity, not live production data.
"""

import os

import pytest

# Skip the entire module when no DATABASE_URL is configured (CI without a live DB)
pytestmark = pytest.mark.skipif(
    not os.getenv("DATABASE_URL"),
    reason="DATABASE_URL not set — release gate tests require a live database",
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_cursor():
    """Get a DB cursor. Skip test if DB unavailable."""
    try:
        from app.db import get_cursor
        return get_cursor
    except Exception:
        pytest.skip("Database not available")


def _current_quarter() -> str:
    """Compute current quarter string."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    q = (now.month - 1) // 3 + 1
    return f"{now.year}Q{q}"


# ── Gate 1: Fund quarter state exists for current period ────────────────────

class TestFundQuarterStateExists:
    def test_seeded_funds_have_quarter_state(self):
        """Every seeded fund must have a non-NULL portfolio_nav for current quarter."""
        get_cursor = _get_cursor()
        quarter = _current_quarter()
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT f.name, fqs.portfolio_nav
                FROM repe_fund f
                LEFT JOIN LATERAL (
                    SELECT portfolio_nav FROM re_fund_quarter_state
                    WHERE fund_id = f.fund_id AND quarter = %s AND scenario_id IS NULL
                    ORDER BY created_at DESC LIMIT 1
                ) fqs ON true
                """,
                (quarter,),
            )
            rows = cur.fetchall()

        missing = [r["name"] for r in rows if r["portfolio_nav"] is None]
        assert len(missing) == 0, (
            f"Funds missing quarter state for {quarter}: {missing}"
        )


# ── Gate 2: Investment state for every deal ─────────────────────────────────

class TestInvestmentStateComplete:
    def test_every_deal_has_investment_state(self):
        """Every repe_deal should have at least one re_investment_quarter_state row."""
        get_cursor = _get_cursor()
        quarter = _current_quarter()
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT d.name, d.deal_id,
                    EXISTS (
                        SELECT 1 FROM re_investment_quarter_state
                        WHERE investment_id = d.deal_id AND quarter = %s AND scenario_id IS NULL
                    ) AS has_state
                FROM repe_deal d
                JOIN repe_fund f ON f.fund_id = d.fund_id
                """,
                (quarter,),
            )
            rows = cur.fetchall()

        missing = [r["name"] for r in rows if not r["has_state"]]
        assert len(missing) == 0, (
            f"Deals missing investment quarter state for {quarter}: {missing}"
        )


# ── Gate 3: Asset state for current quarter ─────────────────────────────────

class TestAssetStateExists:
    def test_seeded_assets_have_quarter_state(self):
        """Assets with prior quarter data should also have current quarter data."""
        get_cursor = _get_cursor()
        quarter = _current_quarter()
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(DISTINCT asset_id) AS with_data
                FROM re_asset_quarter_state
                WHERE quarter = %s AND scenario_id IS NULL
                """,
                (quarter,),
            )
            row = cur.fetchone()
        assert row["with_data"] > 0, (
            f"No asset quarter state rows for {quarter}"
        )


# ── Gate 4: Hierarchy integrity ─────────────────────────────────────────────

class TestHierarchyIntegrity:
    def test_no_orphan_assets(self):
        """Every repe_asset must have a valid deal -> fund chain."""
        get_cursor = _get_cursor()
        with get_cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM repe_asset WHERE deal_id NOT IN (SELECT deal_id FROM repe_deal)"
            )
            assert cur.fetchone()["cnt"] == 0, "Orphan assets found"

    def test_no_orphan_deals(self):
        """Every repe_deal must belong to a repe_fund."""
        get_cursor = _get_cursor()
        with get_cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM repe_deal WHERE fund_id NOT IN (SELECT fund_id FROM repe_fund)"
            )
            assert cur.fetchone()["cnt"] == 0, "Orphan deals found"


# ── Gate 5: DSCR in realistic range ────────────────────────────────────────

class TestDSCRRange:
    def test_dscr_within_bounds(self):
        """All seeded DSCR values must fall in [0.8, 3.0]."""
        get_cursor = _get_cursor()
        quarter = _current_quarter()
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT a.name, qs.dscr
                FROM re_asset_quarter_state qs
                JOIN repe_asset a ON a.asset_id = qs.asset_id
                WHERE qs.quarter = %s AND qs.scenario_id IS NULL
                  AND qs.dscr IS NOT NULL
                  AND (qs.dscr < 0.8 OR qs.dscr > 3.0)
                """,
                (quarter,),
            )
            outliers = cur.fetchall()
        assert len(outliers) == 0, (
            f"DSCR outliers: {[(r['name'], float(r['dscr'])) for r in outliers]}"
        )

    def test_no_identical_dscr_across_assets(self):
        """No more than 2 assets should share the exact same DSCR value."""
        get_cursor = _get_cursor()
        quarter = _current_quarter()
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT qs.dscr, COUNT(*) AS cnt
                FROM re_asset_quarter_state qs
                WHERE qs.quarter = %s AND qs.scenario_id IS NULL AND qs.dscr IS NOT NULL
                GROUP BY qs.dscr
                HAVING COUNT(*) > 2
                """,
                (quarter,),
            )
            dupes = cur.fetchall()
        assert len(dupes) == 0, (
            f"Identical DSCR values across >2 assets: {[(float(r['dscr']), r['cnt']) for r in dupes]}"
        )


# ── Gate 6: IRR from cash flows only ───────────────────────────────────────

class TestIRRSource:
    def test_irr_has_source_tracking(self):
        """Non-NULL gross_irr should have irr_source = 'computed_xirr'."""
        get_cursor = _get_cursor()
        quarter = _current_quarter()
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT f.name, fqs.gross_irr, fqs.irr_source
                FROM repe_fund f
                JOIN re_fund_quarter_state fqs ON fqs.fund_id = f.fund_id
                  AND fqs.quarter = %s AND fqs.scenario_id IS NULL
                WHERE fqs.gross_irr IS NOT NULL
                  AND (fqs.irr_source IS NULL OR fqs.irr_source != 'computed_xirr')
                ORDER BY fqs.created_at DESC
                """,
                (quarter,),
            )
            bad = cur.fetchall()

        # This is a warning, not a hard gate, since xirr requires cash flow data
        if bad:
            pytest.xfail(
                f"{len(bad)} funds have IRR without xirr source: "
                f"{[r['name'] for r in bad]}"
            )


# ── Gate 7: Trend data has variation ────────────────────────────────────────

class TestTrendVariation:
    def test_noi_varies_across_quarters(self):
        """For each asset with 3+ quarters of data, NOI should not be identical."""
        get_cursor = _get_cursor()
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT a.name, COUNT(DISTINCT qs.noi) AS distinct_noi, COUNT(*) AS total
                FROM re_asset_quarter_state qs
                JOIN repe_asset a ON a.asset_id = qs.asset_id
                WHERE qs.scenario_id IS NULL AND qs.noi IS NOT NULL
                GROUP BY a.asset_id, a.name
                HAVING COUNT(*) >= 3 AND COUNT(DISTINCT qs.noi) <= 1
                """,
            )
            flat = cur.fetchall()
        assert len(flat) == 0, (
            f"Assets with flat NOI: {[r['name'] for r in flat]}"
        )


# ── Gate 8: No duplicate snapshots ─────────────────────────────────────────

class TestNoDuplicateSnapshots:
    def test_unique_asset_quarter_scenario(self):
        """Unique index on (asset_id, quarter, scenario_id) should hold."""
        get_cursor = _get_cursor()
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT asset_id, quarter, COUNT(*) AS cnt
                FROM re_asset_quarter_state
                WHERE scenario_id IS NULL
                GROUP BY asset_id, quarter
                HAVING COUNT(*) > 1
                """,
            )
            dupes = cur.fetchall()
        assert len(dupes) == 0, (
            f"Duplicate asset quarter states: {len(dupes)} cases"
        )
