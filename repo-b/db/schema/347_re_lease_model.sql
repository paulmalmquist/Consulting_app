-- 347: Canonical REPE lease data model.
-- Eight tables + one SQL view for institutional lease/tenant intelligence at the asset level.
-- Fully additive — no changes to existing tables.
-- Safe to re-run: all objects use IF NOT EXISTS / CREATE OR REPLACE.

-- ─────────────────────────────────────────────────────────────────────────────
-- re_tenant: Normalized tenant master scoped to a business.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_tenant (
  tenant_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL,
  name          text NOT NULL,
  trade_name    text,
  industry      text,
  credit_rating text,
  is_anchor     boolean NOT NULL DEFAULT false,
  naics_code    text,
  hq_city       text,
  hq_state      text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_re_tenant_business ON re_tenant(business_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- re_asset_space: Leaseable suites / spaces within an asset.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_asset_space (
  space_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  suite_number  text NOT NULL,
  floor         int,
  rentable_sf   numeric(18,4) NOT NULL CHECK (rentable_sf > 0),
  usable_sf     numeric(18,4),
  space_type    text NOT NULL DEFAULT 'office'
    CHECK (space_type IN ('office', 'retail', 'storage', 'common', 'parking', 'flex')),
  status        text NOT NULL DEFAULT 'leased'
    CHECK (status IN ('leased', 'vacant', 'under_renovation', 'reserved')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_re_asset_space_asset ON re_asset_space(asset_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- re_lease: Canonical REPE lease header.
-- Distinct from the generic property-management `lease` table in 220_property.sql.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_lease (
  lease_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id             uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  space_id             uuid REFERENCES re_asset_space(space_id),
  tenant_id            uuid NOT NULL REFERENCES re_tenant(tenant_id),
  lease_type           text NOT NULL DEFAULT 'full_service'
    CHECK (lease_type IN ('full_service', 'nnn', 'modified_gross', 'ground')),
  status               text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'pending', 'terminated', 'holdover')),
  commencement_date    date NOT NULL,
  expiration_date      date NOT NULL,
  base_rent_psf        numeric(18,4) NOT NULL CHECK (base_rent_psf >= 0),
  rentable_sf          numeric(18,4) NOT NULL CHECK (rentable_sf > 0),
  security_deposit     numeric(28,12),
  free_rent_months     int NOT NULL DEFAULT 0,
  ti_allowance_psf     numeric(18,4),
  renewal_options      text,       -- e.g. '2 x 5 year options at FMV'
  expansion_option     boolean NOT NULL DEFAULT false,
  termination_option   boolean NOT NULL DEFAULT false,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_re_lease_dates CHECK (expiration_date > commencement_date)
);
CREATE INDEX IF NOT EXISTS idx_re_lease_asset      ON re_lease(asset_id);
CREATE INDEX IF NOT EXISTS idx_re_lease_tenant     ON re_lease(tenant_id);
CREATE INDEX IF NOT EXISTS idx_re_lease_expiration ON re_lease(expiration_date);
CREATE INDEX IF NOT EXISTS idx_re_lease_status     ON re_lease(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- re_lease_step: Structured rent schedule for each lease period.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_lease_step (
  step_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id         uuid NOT NULL REFERENCES re_lease(lease_id) ON DELETE CASCADE,
  step_start_date  date NOT NULL,
  step_end_date    date NOT NULL,
  annual_rent_psf  numeric(18,4) NOT NULL CHECK (annual_rent_psf >= 0),
  monthly_rent     numeric(28,12) NOT NULL CHECK (monthly_rent >= 0),
  escalation_type  text NOT NULL DEFAULT 'fixed'
    CHECK (escalation_type IN ('fixed', 'cpi', 'percentage')),
  escalation_pct   numeric(8,4),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_re_lease_step_dates CHECK (step_end_date > step_start_date)
);
CREATE INDEX IF NOT EXISTS idx_re_lease_step_lease ON re_lease_step(lease_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- re_lease_charge: Recurring charge economics per lease (CAM, taxes, etc.).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_lease_charge (
  charge_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id       uuid NOT NULL REFERENCES re_lease(lease_id) ON DELETE CASCADE,
  charge_type    text NOT NULL
    CHECK (charge_type IN ('cam', 'insurance', 'taxes', 'parking', 'electricity', 'misc')),
  amount_psf     numeric(18,4),
  amount_monthly numeric(28,12),
  recoverable    boolean NOT NULL DEFAULT true,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_re_lease_charge_lease ON re_lease_charge(lease_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- re_lease_document: Links leases to uploaded / extracted documents.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_lease_document (
  doc_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id        uuid NOT NULL REFERENCES re_lease(lease_id) ON DELETE CASCADE,
  doc_type        text NOT NULL DEFAULT 'original_lease'
    CHECK (doc_type IN (
      'original_lease', 'amendment', 'estoppel', 'snda',
      'assignment', 'termination_notice', 'rent_roll'
    )),
  file_name       text NOT NULL,
  storage_path    text,
  parser_status   text NOT NULL DEFAULT 'pending'
    CHECK (parser_status IN (
      'pending', 'processing', 'complete', 'failed', 'not_applicable'
    )),
  confidence      numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  extracted_data  jsonb,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  uploaded_by     uuid,
  notes           text
);
CREATE INDEX IF NOT EXISTS idx_re_lease_document_lease ON re_lease_document(lease_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- re_rent_roll_snapshot: Point-in-time lease/occupancy summary per asset.
-- UNIQUE(asset_id, as_of_date) supports idempotent seeding.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_rent_roll_snapshot (
  snapshot_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id             uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  as_of_date           date NOT NULL,
  quarter              text NOT NULL,          -- e.g. '2026Q1'
  total_sf             numeric(18,4) NOT NULL, -- leasable RSF
  leased_sf            numeric(18,4) NOT NULL,
  occupied_sf          numeric(18,4) NOT NULL,
  economic_occupancy   numeric(8,6),           -- economic occ pct (0..1)
  physical_occupancy   numeric(8,6),           -- physical occ pct (0..1)
  weighted_avg_rent_psf numeric(18,4),
  total_annual_base_rent numeric(28,12),
  walt_years           numeric(8,4),
  market_rent_psf      numeric(18,4),
  mark_to_market_pct   numeric(8,4),           -- e.g. 0.099 = 9.9%
  source               text NOT NULL DEFAULT 'manual',
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, as_of_date)
);
CREATE INDEX IF NOT EXISTS idx_re_rent_roll_snapshot_asset   ON re_rent_roll_snapshot(asset_id);
CREATE INDEX IF NOT EXISTS idx_re_rent_roll_snapshot_quarter ON re_rent_roll_snapshot(quarter);

-- ─────────────────────────────────────────────────────────────────────────────
-- re_lease_event: Timeline events (option notices, expirations, amendments).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_lease_event (
  event_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id        uuid NOT NULL REFERENCES re_lease(lease_id) ON DELETE CASCADE,
  event_type      text NOT NULL
    CHECK (event_type IN (
      'rent_commencement', 'rent_step', 'option_notice_due', 'option_exercise',
      'expiration_notice', 'termination', 'assignment', 'amendment', 'estoppel_request'
    )),
  event_date      date NOT NULL,
  notice_due_date date,
  description     text,
  is_resolved     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_re_lease_event_lease ON re_lease_event(lease_id);
CREATE INDEX IF NOT EXISTS idx_re_lease_event_date  ON re_lease_event(event_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- re_asset_lease_summary_v: SQL view — asset-level lease KPI rollup.
-- Used by /leasing/summary API. Reads latest snapshot for PSF/WALT.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW re_asset_lease_summary_v AS
SELECT
  a.asset_id,
  COUNT(DISTINCT l.lease_id)  FILTER (WHERE l.status = 'active')  AS lease_count,
  COUNT(DISTINCT l.tenant_id) FILTER (WHERE l.status = 'active')  AS tenant_count,
  COALESCE(
    SUM(l.rentable_sf) FILTER (WHERE l.status = 'active'), 0
  )                                                                AS leased_sf,
  -- WALT: weighted by SF, years remaining from today
  CASE
    WHEN SUM(l.rentable_sf)
         FILTER (WHERE l.status = 'active' AND l.expiration_date > CURRENT_DATE) > 0
    THEN
      SUM(
        l.rentable_sf * GREATEST(
          EXTRACT(
            EPOCH FROM (l.expiration_date::timestamp - CURRENT_DATE::timestamp)
          ) / (365.25 * 86400),
          0
        )
      ) FILTER (WHERE l.status = 'active' AND l.expiration_date > CURRENT_DATE)
      /
      SUM(l.rentable_sf) FILTER (WHERE l.status = 'active' AND l.expiration_date > CURRENT_DATE)
    ELSE NULL
  END                                                              AS walt_years,
  -- Top tenant name (by rentable SF)
  (
    SELECT t2.name
    FROM re_tenant t2
    JOIN re_lease  l2 ON l2.tenant_id = t2.tenant_id
    WHERE l2.asset_id = a.asset_id AND l2.status = 'active'
    ORDER BY l2.rentable_sf DESC
    LIMIT 1
  )                                                                AS top_tenant_name,
  -- Anchor tenant SF as pct of leased SF
  COALESCE(
    SUM(l.rentable_sf) FILTER (WHERE l.status = 'active' AND t.is_anchor),
    0
  ) / NULLIF(
    SUM(l.rentable_sf) FILTER (WHERE l.status = 'active'), 0
  )                                                                AS anchor_pct,
  -- Next lease expiration among active leases
  MIN(l.expiration_date) FILTER (WHERE l.status = 'active')       AS next_expiration,
  -- Latest rent roll snapshot fields
  rr.weighted_avg_rent_psf                                         AS in_place_psf,
  rr.market_rent_psf,
  rr.mark_to_market_pct,
  rr.total_annual_base_rent,
  rr.walt_years                                                    AS snapshot_walt,
  rr.physical_occupancy                                            AS snapshot_occupancy,
  rr.total_sf                                                      AS leasable_sf,
  rr.as_of_date                                                    AS snapshot_date
FROM repe_asset a
LEFT JOIN re_lease  l ON l.asset_id  = a.asset_id
LEFT JOIN re_tenant t ON t.tenant_id = l.tenant_id
LEFT JOIN LATERAL (
  SELECT
    weighted_avg_rent_psf,
    market_rent_psf,
    mark_to_market_pct,
    total_annual_base_rent,
    walt_years,
    physical_occupancy,
    total_sf,
    as_of_date
  FROM re_rent_roll_snapshot
  WHERE asset_id = a.asset_id
  ORDER BY as_of_date DESC
  LIMIT 1
) rr ON true
GROUP BY
  a.asset_id,
  rr.weighted_avg_rent_psf,
  rr.market_rent_psf,
  rr.mark_to_market_pct,
  rr.total_annual_base_rent,
  rr.walt_years,
  rr.physical_occupancy,
  rr.total_sf,
  rr.as_of_date;
