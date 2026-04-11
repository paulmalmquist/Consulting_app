-- Migration 464: Logical unique constraints on REPE core tables
--
-- Prevents duplicate fund / deal / asset rows that contaminate rollup JOINs.
-- Must be applied AFTER migration 463 (orphan fund dedup) so the constraint
-- is built on clean data.
--
-- Idempotent: uses CREATE UNIQUE INDEX IF NOT EXISTS throughout.

-- ── repe_fund ──────────────────────────────────────────────────────────────
-- A fund is uniquely identified within a business by (name, vintage_year,
-- strategy).  The quarantined orphan rows from migration 463 have
-- strategy = 'quarantined', which is excluded from this constraint so they
-- can coexist with the canonical rows without needing to be deleted.

CREATE UNIQUE INDEX IF NOT EXISTS uidx_repe_fund_logical
    ON repe_fund (business_id, lower(name), vintage_year, strategy)
    WHERE strategy IS DISTINCT FROM 'quarantined';

COMMENT ON INDEX uidx_repe_fund_logical IS
    'Prevents duplicate logical fund rows within a business entity.  '
    'Quarantined orphan rows (strategy=''quarantined'') are excluded from '
    'this constraint so they can coexist without blocking INSERTs.';

-- ── repe_deal ──────────────────────────────────────────────────────────────
-- A deal is uniquely identified within a fund by name (case-insensitive).

CREATE UNIQUE INDEX IF NOT EXISTS uidx_repe_deal_logical
    ON repe_deal (fund_id, lower(name));

COMMENT ON INDEX uidx_repe_deal_logical IS
    'Prevents duplicate deal rows within a fund.';

-- ── repe_asset ─────────────────────────────────────────────────────────────
-- An asset is uniquely identified within a deal by (name, property_type).
-- The (name, property_type) pair is used rather than name alone because
-- the same property address can appear with different product types
-- (e.g. office vs. retail at the same address) as distinct assets.

CREATE UNIQUE INDEX IF NOT EXISTS uidx_repe_asset_logical
    ON repe_asset (deal_id, lower(name), property_type)
    WHERE property_type IS NOT NULL;

-- Fallback constraint when property_type is NULL (seed / pipeline assets)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_repe_asset_logical_null_type
    ON repe_asset (deal_id, lower(name))
    WHERE property_type IS NULL;

COMMENT ON INDEX uidx_repe_asset_logical IS
    'Prevents duplicate asset rows within a deal when property_type is set.';
COMMENT ON INDEX uidx_repe_asset_logical_null_type IS
    'Prevents duplicate asset rows within a deal when property_type is NULL.';
