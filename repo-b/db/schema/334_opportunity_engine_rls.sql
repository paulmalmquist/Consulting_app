-- 334_opportunity_engine_rls.sql
-- Row-level security for Opportunity Engine tables.

ALTER TABLE model_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY model_runs_isolation ON model_runs
    USING (
      business_id IN (
        SELECT business_id
        FROM business
        WHERE tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE opportunity_scores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY opportunity_scores_isolation ON opportunity_scores
    USING (
      business_id IN (
        SELECT business_id
        FROM business
        WHERE tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE project_recommendations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY project_recommendations_isolation ON project_recommendations
    USING (
      business_id IN (
        SELECT business_id
        FROM business
        WHERE tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE market_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY market_signals_isolation ON market_signals
    USING (
      business_id IN (
        SELECT business_id
        FROM business
        WHERE tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE forecast_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY forecast_snapshots_isolation ON forecast_snapshots
    USING (
      business_id IN (
        SELECT business_id
        FROM business
        WHERE tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE signal_explanations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY signal_explanations_isolation ON signal_explanations
    USING (
      run_id IN (
        SELECT run_id
        FROM model_runs
        WHERE business_id IN (
          SELECT business_id
          FROM business
          WHERE tenant_id = current_tenant_id()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
