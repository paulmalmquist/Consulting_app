-- 910_fin_rls.sql
-- Row-level security policies for canonical finance tables.

CREATE OR REPLACE FUNCTION fin_apply_tenant_rls(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_policy_name text;
BEGIN
  IF to_regclass(p_table) IS NULL THEN
    RETURN;
  END IF;

  v_policy_name := p_table || '_isolation';

  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);

  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = current_tenant_id())',
      v_policy_name,
      p_table
    );
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END;
$$;

SELECT fin_apply_tenant_rls('fin_partition');
SELECT fin_apply_tenant_rls('fin_snapshot');
SELECT fin_apply_tenant_rls('fin_partition_clone_map');
SELECT fin_apply_tenant_rls('fin_entity');
SELECT fin_apply_tenant_rls('fin_entity_hierarchy');
SELECT fin_apply_tenant_rls('fin_participant');
SELECT fin_apply_tenant_rls('fin_participation');
SELECT fin_apply_tenant_rls('fin_posting_batch');
SELECT fin_apply_tenant_rls('fin_journal_entry');
SELECT fin_apply_tenant_rls('fin_journal_line');
SELECT fin_apply_tenant_rls('fin_source_link');
SELECT fin_apply_tenant_rls('fin_reconciliation_run');
SELECT fin_apply_tenant_rls('fin_period_close_lock');
SELECT fin_apply_tenant_rls('fin_capital_account');
SELECT fin_apply_tenant_rls('fin_capital_event');
SELECT fin_apply_tenant_rls('fin_capital_rollforward');
SELECT fin_apply_tenant_rls('fin_irr_result');
SELECT fin_apply_tenant_rls('fin_rule_book');
SELECT fin_apply_tenant_rls('fin_rule_version');
SELECT fin_apply_tenant_rls('fin_allocation_tier');
SELECT fin_apply_tenant_rls('fin_allocation_tier_split');
SELECT fin_apply_tenant_rls('fin_allocation_run');
SELECT fin_apply_tenant_rls('fin_allocation_line');
SELECT fin_apply_tenant_rls('fin_clawback_position');
SELECT fin_apply_tenant_rls('fin_promote_position');
SELECT fin_apply_tenant_rls('fin_fund');
SELECT fin_apply_tenant_rls('fin_fund_vehicle');
SELECT fin_apply_tenant_rls('fin_asset_investment');
SELECT fin_apply_tenant_rls('fin_commitment');
SELECT fin_apply_tenant_rls('fin_capital_call');
SELECT fin_apply_tenant_rls('fin_contribution');
SELECT fin_apply_tenant_rls('fin_distribution_event');
SELECT fin_apply_tenant_rls('fin_distribution_payout');
SELECT fin_apply_tenant_rls('fin_matter');
SELECT fin_apply_tenant_rls('fin_time_capture');
SELECT fin_apply_tenant_rls('fin_realization_event');
SELECT fin_apply_tenant_rls('fin_contingency_case');
SELECT fin_apply_tenant_rls('fin_trust_account');
SELECT fin_apply_tenant_rls('fin_trust_transaction');
SELECT fin_apply_tenant_rls('fin_redline_version');
SELECT fin_apply_tenant_rls('fin_mso');
SELECT fin_apply_tenant_rls('fin_clinic');
SELECT fin_apply_tenant_rls('fin_provider');
SELECT fin_apply_tenant_rls('fin_provider_comp_plan');
SELECT fin_apply_tenant_rls('fin_provider_comp_run');
SELECT fin_apply_tenant_rls('fin_claim');
SELECT fin_apply_tenant_rls('fin_claim_denial');
SELECT fin_apply_tenant_rls('fin_referral_source');
SELECT fin_apply_tenant_rls('fin_referral_metric');
SELECT fin_apply_tenant_rls('fin_construction_project');
SELECT fin_apply_tenant_rls('fin_budget');
SELECT fin_apply_tenant_rls('fin_budget_version');
SELECT fin_apply_tenant_rls('fin_budget_line_csi');
SELECT fin_apply_tenant_rls('fin_change_order_version');
SELECT fin_apply_tenant_rls('fin_contract_commitment');
SELECT fin_apply_tenant_rls('fin_forecast_snapshot');
SELECT fin_apply_tenant_rls('fin_forecast_line');
SELECT fin_apply_tenant_rls('fin_lien_waiver_status');
SELECT fin_apply_tenant_rls('fin_role');
SELECT fin_apply_tenant_rls('fin_data_classification');
SELECT fin_apply_tenant_rls('fin_entity_acl');
SELECT fin_apply_tenant_rls('fin_field_acl');
SELECT fin_apply_tenant_rls('fin_download_audit');
SELECT fin_apply_tenant_rls('fin_run');
SELECT fin_apply_tenant_rls('fin_run_result_ref');
SELECT fin_apply_tenant_rls('fin_run_event');

DROP FUNCTION fin_apply_tenant_rls(text);
