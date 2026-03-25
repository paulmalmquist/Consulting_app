-- 305_cre_intelligence_rls.sql
-- RLS for env-scoped CRE intelligence tables and read-only shared reference tables.

DO $$
DECLARE
  _tbl text;
BEGIN
  FOR _tbl IN
    SELECT unnest(ARRAY[
      'dim_property',
      'dim_entity',
      'bridge_property_entity',
      'bridge_property_geography',
      'fact_property_timeseries',
      'doc_store_index',
      'feature_store',
      'forecast_registry',
      'forecast_questions',
      'cre_entity_resolution_candidate',
      'cre_entity_resolution_decision',
      'forecast_backtest_result'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', _tbl);
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL
           USING (
             EXISTS (
               SELECT 1
               FROM business b
               WHERE b.business_id = %I.business_id
                 AND b.tenant_id = current_tenant_id()
             )
           )
           WITH CHECK (
             EXISTS (
               SELECT 1
               FROM business b
               WHERE b.business_id = %I.business_id
                 AND b.tenant_id = current_tenant_id()
             )
           )',
        _tbl || '_tenant_isolation',
        _tbl,
        _tbl,
        _tbl
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;

ALTER TABLE IF EXISTS forecast_signal_observation ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY forecast_signal_observation_tenant_isolation
  ON forecast_signal_observation
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM forecast_questions fq
      JOIN business b ON b.business_id = fq.business_id
      WHERE fq.question_id = forecast_signal_observation.question_id
        AND b.tenant_id = current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM forecast_questions fq
      JOIN business b ON b.business_id = fq.business_id
      WHERE fq.question_id = forecast_signal_observation.question_id
        AND b.tenant_id = current_tenant_id()
    )
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
DECLARE
  _tbl text;
BEGIN
  FOR _tbl IN
    SELECT unnest(ARRAY[
      'dim_geography',
      'cre_geography_alias',
      'fact_market_timeseries',
      'cre_source_registry',
      'cre_metric_catalog',
      'cre_feature_set_catalog',
      'cre_model_catalog',
      'cre_forecast_question_template'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', _tbl);
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT USING (true)',
        _tbl || '_read_only',
        _tbl
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;
