-- 312_crm_deal_close.sql
-- Add win/loss capture fields to crm_opportunity.
-- Populated when a deal is advanced to closed_won or closed_lost.
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE crm_opportunity
  ADD COLUMN IF NOT EXISTS close_reason         text,
  ADD COLUMN IF NOT EXISTS competitive_incumbent text,
  ADD COLUMN IF NOT EXISTS close_notes          text,
  ADD COLUMN IF NOT EXISTS closed_at            timestamptz;
