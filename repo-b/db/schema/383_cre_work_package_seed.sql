-- CRE Intelligence: Seed work packages
-- Four curated CRE workflows matching Cherre's "Work Packages" concept.

INSERT INTO cre_work_package (package_key, display_name, description, category, tool_chain, estimated_duration_s)
VALUES
  ('due_diligence',
   'Property Due Diligence',
   'Full due diligence workflow: property detail, owner unmasking, comparable properties, zoning, and report generation.',
   'due_diligence',
   '[
     {"step_key": "fetch_property", "tool_name": "repe_get_property_detail", "input_map": {"property_id": "$inputs.property_id"}, "output_key": "property", "on_error": "fail"},
     {"step_key": "unmask_owners", "tool_name": "cre_owner_unmasking_report", "input_map": {"property_id": "$inputs.property_id", "env_id": "$inputs.env_id"}, "output_key": "owners", "on_error": "continue"},
     {"step_key": "find_comps", "tool_name": "repe_property_comps", "input_map": {"property_id": "$inputs.property_id", "radius_miles": 2}, "output_key": "comps", "on_error": "continue"},
     {"step_key": "get_features", "tool_name": "cre_property_features", "input_map": {"property_id": "$inputs.property_id"}, "output_key": "features", "on_error": "continue"},
     {"step_key": "generate_report", "tool_name": "repe_generate_report", "input_map": {"property": "$steps.fetch_property", "owners": "$steps.unmask_owners", "comps": "$steps.find_comps"}, "output_key": "report", "on_error": "fail"}
   ]'::jsonb,
   120),

  ('market_scan',
   'Market Scan',
   'Comprehensive market analysis: geography demographics, rent trends, employment data, and summary.',
   'market_analysis',
   '[
     {"step_key": "get_geography", "tool_name": "cre_list_geographies", "input_map": {"layer": "$inputs.layer", "bbox": "$inputs.bbox"}, "output_key": "geographies", "on_error": "fail"},
     {"step_key": "get_demographics", "tool_name": "cre_market_demographics", "input_map": {"geography_id": "$steps.get_geography.features[0].properties.geography_id"}, "output_key": "demographics", "on_error": "continue"},
     {"step_key": "get_employment", "tool_name": "cre_market_employment", "input_map": {"geography_id": "$steps.get_geography.features[0].properties.geography_id"}, "output_key": "employment", "on_error": "continue"},
     {"step_key": "summarize", "tool_name": "repe_generate_market_summary", "input_map": {"demographics": "$steps.get_demographics", "employment": "$steps.get_employment"}, "output_key": "summary", "on_error": "fail"}
   ]'::jsonb,
   90),

  ('risk_assessment',
   'Risk Assessment',
   'Property risk scoring: features, forecasts, externalities, and composite risk score.',
   'risk',
   '[
     {"step_key": "get_features", "tool_name": "cre_property_features", "input_map": {"property_id": "$inputs.property_id"}, "output_key": "features", "on_error": "fail"},
     {"step_key": "get_forecasts", "tool_name": "cre_materialize_forecasts", "input_map": {"property_id": "$inputs.property_id"}, "output_key": "forecasts", "on_error": "continue"},
     {"step_key": "get_externalities", "tool_name": "cre_property_externalities", "input_map": {"property_id": "$inputs.property_id"}, "output_key": "externalities", "on_error": "continue"},
     {"step_key": "score_risk", "tool_name": "repe_risk_score", "input_map": {"features": "$steps.get_features", "forecasts": "$steps.get_forecasts", "externalities": "$steps.get_externalities"}, "output_key": "risk_score", "on_error": "fail"}
   ]'::jsonb,
   60),

  ('investor_outreach',
   'Investor Outreach',
   'Owner identification and outreach prep: unmask owners, build entity profile, draft outreach.',
   'outreach',
   '[
     {"step_key": "unmask", "tool_name": "cre_owner_unmasking_report", "input_map": {"property_id": "$inputs.property_id", "env_id": "$inputs.env_id"}, "output_key": "owners", "on_error": "fail"},
     {"step_key": "profile", "tool_name": "cre_owner_graph", "input_map": {"entity_id": "$steps.unmask.beneficial_owners[0].entity_id", "env_id": "$inputs.env_id"}, "output_key": "profile", "on_error": "continue"},
     {"step_key": "draft_outreach", "tool_name": "repe_draft_outreach", "input_map": {"entity": "$steps.profile", "property_id": "$inputs.property_id"}, "output_key": "outreach", "on_error": "fail"}
   ]'::jsonb,
   45)
ON CONFLICT (package_key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      tool_chain = EXCLUDED.tool_chain,
      estimated_duration_s = EXCLUDED.estimated_duration_s,
      updated_at = now();

-- Register county_assessor and rentcast in source registry
INSERT INTO cre_source_registry (source_key, display_name, source_type, license_class,
  allows_robotic_access, respect_robots_txt, rate_limit_per_minute, source_url, default_scope, is_enabled)
VALUES
  ('county_assessor', 'Miami-Dade Property Appraiser', 'ownership', 'public',
   true, true, 30, 'https://opendata.miamidade.gov',
   '{"scope":"county","county_fips":"12086"}'::jsonb, true),
  ('rentcast', 'RentCast Rental Data', 'rental', 'restricted',
   true, true, 60, 'https://api.rentcast.io',
   '{"scope":"metro","metro":"33100"}'::jsonb, true)
ON CONFLICT (source_key) DO NOTHING;
