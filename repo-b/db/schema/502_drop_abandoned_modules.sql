-- 502_drop_abandoned_modules.sql
-- Orphaned module triage:
-- 1) Drop clearly abandoned experimental prefixes.
-- 2) Add explicit ownership comments to durable but currently orphaned clusters.
--
-- Resume tables are intentionally NOT dropped here. The Visual Resume environment is active in this repo.

DO $$
DECLARE
  _tbl text;
BEGIN
  FOR _tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (
        tablename LIKE 'psychrag\_%' ESCAPE '\'
        OR tablename LIKE 'medoffice\_%' ESCAPE '\'
        OR tablename LIKE 'epi\_%' ESCAPE '\'
      )
    ORDER BY tablename
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', _tbl);
  END LOOP;
END $$;

DO $$
DECLARE
  _tbl text;
  _comment text;
BEGIN
  FOR _tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (
        tablename LIKE 'legal\_%' ESCAPE '\'
        OR tablename LIKE 'credit\_%' ESCAPE '\'
        OR tablename LIKE 'uw\_%' ESCAPE '\'
        OR tablename LIKE 'kb\_%' ESCAPE '\'
        OR tablename LIKE 'scenario\_%' ESCAPE '\'
      )
    ORDER BY tablename
  LOOP
    _comment := CASE
      WHEN _tbl LIKE 'legal\_%' ESCAPE '\' THEN
        'Owned by the legal module. Preserved during 2026-03-29 orphan triage because legal ops is a durable Winston surface.'
      WHEN _tbl LIKE 'credit\_%' ESCAPE '\' THEN
        'Owned by the credit workflow module. Preserved during 2026-03-29 orphan triage pending workflow rollout and seed coverage.'
      WHEN _tbl LIKE 'uw\_%' ESCAPE '\' THEN
        'Owned by the underwriting module. Preserved during 2026-03-29 orphan triage as core underwriting infrastructure.'
      WHEN _tbl LIKE 'kb\_%' ESCAPE '\' THEN
        'Owned by the knowledge-base and RAG support layer. Preserved during 2026-03-29 orphan triage for future retrieval features.'
      ELSE
        'Owned by the scenario-analysis module. Preserved during 2026-03-29 orphan triage as durable modeling infrastructure.'
    END;

    EXECUTE format('COMMENT ON TABLE %I IS %L', _tbl, _comment);
  END LOOP;
END $$;

DO $$
DECLARE
  _tbl text;
BEGIN
  FOR _tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (
        tablename LIKE 'dc\_%' ESCAPE '\'
        OR tablename LIKE 'cc\_%' ESCAPE '\'
      )
    ORDER BY tablename
  LOOP
    EXECUTE format(
      'COMMENT ON TABLE %I IS %L',
      _tbl,
      'Investigation pending from 2026-03-29 orphan triage. Confirm active consumers and seed expectations before dropping or expanding this table cluster.'
    );
  END LOOP;
END $$;
