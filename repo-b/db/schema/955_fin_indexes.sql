-- 955_fin_indexes.sql
-- Performance indexes for canonical finance schema.

CREATE INDEX IF NOT EXISTS fin_partition_business_type_idx
  ON fin_partition (tenant_id, business_id, partition_type, status);

CREATE INDEX IF NOT EXISTS fin_entity_scope_idx
  ON fin_entity (tenant_id, business_id, partition_id, fin_entity_type_id);

CREATE INDEX IF NOT EXISTS fin_participant_scope_idx
  ON fin_participant (tenant_id, business_id, participant_type);

CREATE INDEX IF NOT EXISTS fin_journal_entry_scope_date_idx
  ON fin_journal_entry (tenant_id, business_id, partition_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS fin_journal_line_entry_idx
  ON fin_journal_line (fin_journal_entry_id, line_number);

CREATE INDEX IF NOT EXISTS fin_source_link_source_idx
  ON fin_source_link (tenant_id, business_id, partition_id, source_table, source_id);

CREATE INDEX IF NOT EXISTS fin_capital_event_scope_date_idx
  ON fin_capital_event (tenant_id, business_id, partition_id, fin_entity_id, fin_participant_id, event_date);

CREATE INDEX IF NOT EXISTS fin_capital_rollforward_scope_idx
  ON fin_capital_rollforward (tenant_id, business_id, partition_id, as_of_date, fin_entity_id, fin_participant_id);

CREATE INDEX IF NOT EXISTS fin_allocation_run_scope_idx
  ON fin_allocation_run (tenant_id, business_id, partition_id, as_of_date, engine_kind);

CREATE INDEX IF NOT EXISTS fin_allocation_line_run_idx
  ON fin_allocation_line (fin_allocation_run_id, line_number);

CREATE INDEX IF NOT EXISTS fin_fund_scope_idx
  ON fin_fund (tenant_id, business_id, partition_id, status);

CREATE INDEX IF NOT EXISTS fin_commitment_fund_idx
  ON fin_commitment (tenant_id, business_id, partition_id, fin_fund_id, fin_participant_id);

CREATE INDEX IF NOT EXISTS fin_contribution_fund_date_idx
  ON fin_contribution (tenant_id, business_id, partition_id, fin_fund_id, contribution_date);

CREATE INDEX IF NOT EXISTS fin_distribution_event_fund_date_idx
  ON fin_distribution_event (tenant_id, business_id, partition_id, fin_fund_id, event_date);

CREATE INDEX IF NOT EXISTS fin_distribution_payout_event_idx
  ON fin_distribution_payout (tenant_id, business_id, partition_id, fin_distribution_event_id, fin_participant_id);

CREATE INDEX IF NOT EXISTS fin_trust_transaction_scope_date_idx
  ON fin_trust_transaction (tenant_id, business_id, partition_id, fin_trust_account_id, txn_date);

CREATE INDEX IF NOT EXISTS fin_claim_scope_status_idx
  ON fin_claim (tenant_id, business_id, partition_id, status, service_date);

CREATE INDEX IF NOT EXISTS fin_claim_denial_claim_idx
  ON fin_claim_denial (tenant_id, business_id, partition_id, fin_claim_id, resolution_status);

CREATE INDEX IF NOT EXISTS fin_forecast_snapshot_scope_idx
  ON fin_forecast_snapshot (tenant_id, business_id, partition_id, fin_construction_project_id, as_of_date);

CREATE INDEX IF NOT EXISTS fin_run_scope_status_idx
  ON fin_run (tenant_id, business_id, partition_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS fin_run_hash_idx
  ON fin_run (deterministic_hash);

CREATE INDEX IF NOT EXISTS fin_run_result_ref_run_idx
  ON fin_run_result_ref (fin_run_id, result_table);
