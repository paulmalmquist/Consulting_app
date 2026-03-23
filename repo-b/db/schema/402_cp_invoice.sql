-- 402_cp_invoice.sql
-- Source documents backing draws with OCR extraction and auto-matching.

CREATE TABLE IF NOT EXISTS cp_invoice (
  invoice_id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                     uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id                uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id                 uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  draw_request_id            uuid REFERENCES cp_draw_request(draw_request_id) ON DELETE SET NULL,
  vendor_id                  uuid REFERENCES pds_vendors(vendor_id) ON DELETE SET NULL,
  contract_id                uuid REFERENCES pds_contracts(contract_id) ON DELETE SET NULL,
  invoice_number             text,
  invoice_date               date,
  total_amount               numeric(28,12) NOT NULL DEFAULT 0,
  -- OCR
  ocr_status                 text NOT NULL DEFAULT 'pending'
    CHECK (ocr_status IN ('pending','processing','completed','failed')),
  ocr_raw_json               jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocr_confidence             numeric(5,4) DEFAULT 0,
  -- Matching
  match_status               text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched','auto_matched','manually_matched','disputed')),
  match_confidence           numeric(5,4) DEFAULT 0,
  matched_cost_code          text,
  matched_line_item_id       uuid,
  -- Storage
  storage_key                text,
  file_name                  text,
  file_size_bytes            bigint,
  mime_type                  text,
  -- Status
  status                     text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','verified','assigned','rejected')),
  -- Standard columns
  source                     text NOT NULL DEFAULT 'upload',
  version_no                 int NOT NULL DEFAULT 1,
  metadata_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by                 text,
  updated_by                 text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cp_invoice_line_item (
  invoice_line_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id                 uuid NOT NULL REFERENCES cp_invoice(invoice_id) ON DELETE CASCADE,
  line_number                int NOT NULL,
  description                text,
  cost_code                  text,
  quantity                   numeric(18,4),
  unit_price                 numeric(18,4),
  amount                     numeric(28,12) NOT NULL DEFAULT 0,
  -- Matching
  match_confidence           numeric(5,4) DEFAULT 0,
  matched_draw_line_id       uuid,
  match_strategy             text,
  match_status               text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched','auto_matched','manual_matched','rejected')),
  -- Standard
  created_at                 timestamptz NOT NULL DEFAULT now()
);
