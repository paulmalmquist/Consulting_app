-- ── Novendor MCP Operator Layer — Column Additions ───────────────────────────
-- Adds two columns required by novendor.* MCP tools:
--   1. cro_outreach_sequence.proof_asset_id  — links a proof asset to a sequence
--   2. cro_trigger_signal.is_primary_trigger — marks the canonical why-now signal

ALTER TABLE cro_outreach_sequence
    ADD COLUMN IF NOT EXISTS proof_asset_id uuid REFERENCES cro_proof_asset(id) ON DELETE SET NULL;

COMMENT ON COLUMN cro_outreach_sequence.proof_asset_id IS
    'Optional proof asset attached to this outreach sequence. Set via novendor.proof_assets.attach_proof_asset_to_account MCP tool.';

ALTER TABLE cro_trigger_signal
    ADD COLUMN IF NOT EXISTS is_primary_trigger boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN cro_trigger_signal.is_primary_trigger IS
    'When true, this is the primary why-now signal for the account. Set via novendor.signals.promote_signal_to_account MCP tool. Only one per lead_profile_id should be true.';

CREATE INDEX IF NOT EXISTS idx_cro_trigger_signal_primary
    ON cro_trigger_signal (lead_profile_id, is_primary_trigger)
    WHERE is_primary_trigger = true;
