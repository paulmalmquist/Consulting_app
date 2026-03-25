-- 348: Lease document ingestion staging tables.
-- Uploaded PDFs and rent roll spreadsheets stage here before promotion to canonical tables.
-- No FKs back into canonical lease tables (staging is pre-reconciliation).
-- Safe to re-run: CREATE TABLE IF NOT EXISTS throughout.

-- ─────────────────────────────────────────────────────────────────────────────
-- stg_lease_extract: Fields extracted from a lease PDF by the parser.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stg_lease_extract (
  extract_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id           uuid,               -- refs re_lease_document.doc_id once linked
  asset_id         uuid,               -- refs repe_asset.asset_id once known
  raw_text         text,
  extracted_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Common extracted fields stored flat for easy querying:
  ext_tenant_name  text,
  ext_suite        text,
  ext_sqft         numeric(18,4),
  ext_commence     date,
  ext_expiration   date,
  ext_base_rent    numeric(18,4),      -- $/SF/yr
  ext_options      text,
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'review', 'promoted', 'rejected')),
  confidence       numeric(5,4),
  reviewer_id      uuid,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stg_lease_extract_asset  ON stg_lease_extract(asset_id);
CREATE INDEX IF NOT EXISTS idx_stg_lease_extract_status ON stg_lease_extract(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- stg_rent_roll_extract: Rows extracted from an uploaded rent roll spreadsheet.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stg_rent_roll_extract (
  extract_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    uuid,                   -- refs repe_asset.asset_id
  source_file text,
  as_of_date  date,
  rows_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  status      text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'review', 'promoted', 'rejected')),
  row_count   int,
  error_count int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stg_rent_roll_extract_asset  ON stg_rent_roll_extract(asset_id);
CREATE INDEX IF NOT EXISTS idx_stg_rent_roll_extract_status ON stg_rent_roll_extract(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- re_lease_reconciliation_queue: Flagged discrepancies between staged and
-- canonical data, awaiting analyst review before automatic promotion.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_lease_reconciliation_queue (
  queue_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id       uuid NOT NULL,       -- refs repe_asset.asset_id
  extract_id     uuid,                -- refs stg_lease_extract or stg_rent_roll_extract
  issue_type     text NOT NULL
    CHECK (issue_type IN (
      'missing_tenant', 'rent_mismatch', 'expiry_mismatch',
      'sf_discrepancy', 'new_lease', 'terminated_lease'
    )),
  description    text,
  current_value  text,
  proposed_value text,
  status         text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'approved', 'rejected', 'auto_resolved')),
  resolved_by    uuid,
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_re_lease_recon_queue_asset   ON re_lease_reconciliation_queue(asset_id);
CREATE INDEX IF NOT EXISTS idx_re_lease_recon_queue_status  ON re_lease_reconciliation_queue(status);
