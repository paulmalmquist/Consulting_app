-- 509_bottom_up_refresh_triggers.sql
-- Source-change invalidation for the bottom-up CF materialization.
--
-- Rule: whenever a source table for the asset CF series changes, drop any
-- cached re_asset_cf_series_mat rows for the affected asset. The next read
-- triggers a rebuild via bottom_up_refresh.refresh_asset_cf_series_materialized.
-- This is the durable propagation mechanism that the initial checkpoint
-- did not have — readers no longer race silently stale caches.

CREATE OR REPLACE FUNCTION bottom_up_invalidate_asset_cache()
RETURNS trigger AS $$
DECLARE
  v_asset_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_asset_id := OLD.asset_id;
  ELSE
    v_asset_id := NEW.asset_id;
  END IF;

  DELETE FROM re_asset_cf_series_mat
  WHERE asset_id = v_asset_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- re_asset_operating_qtr: actual CFs.
DROP TRIGGER IF EXISTS trg_bottom_up_invalidate_operating ON re_asset_operating_qtr;
CREATE TRIGGER trg_bottom_up_invalidate_operating
  AFTER INSERT OR UPDATE OR DELETE ON re_asset_operating_qtr
  FOR EACH ROW EXECUTE FUNCTION bottom_up_invalidate_asset_cache();

-- re_asset_cf_projection: forecast CFs.
DROP TRIGGER IF EXISTS trg_bottom_up_invalidate_projection ON re_asset_cf_projection;
CREATE TRIGGER trg_bottom_up_invalidate_projection
  AFTER INSERT OR UPDATE OR DELETE ON re_asset_cf_projection
  FOR EACH ROW EXECUTE FUNCTION bottom_up_invalidate_asset_cache();

-- re_asset_exit_event: exit assumption revisions.
DROP TRIGGER IF EXISTS trg_bottom_up_invalidate_exit ON re_asset_exit_event;
CREATE TRIGGER trg_bottom_up_invalidate_exit
  AFTER INSERT OR UPDATE OR DELETE ON re_asset_exit_event
  FOR EACH ROW EXECUTE FUNCTION bottom_up_invalidate_asset_cache();

-- repe_asset: acquisition_date / cost_basis changes. The trigger fires on any
-- update but we only invalidate on the columns the CF engine reads.
CREATE OR REPLACE FUNCTION bottom_up_invalidate_asset_cache_on_asset_update()
RETURNS trigger AS $$
BEGIN
  IF NEW.acquisition_date IS DISTINCT FROM OLD.acquisition_date
     OR NEW.cost_basis IS DISTINCT FROM OLD.cost_basis THEN
    DELETE FROM re_asset_cf_series_mat WHERE asset_id = NEW.asset_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bottom_up_invalidate_asset ON repe_asset;
CREATE TRIGGER trg_bottom_up_invalidate_asset
  AFTER UPDATE ON repe_asset
  FOR EACH ROW EXECUTE FUNCTION bottom_up_invalidate_asset_cache_on_asset_update();

-- Investment-level cache invalidation when its child assets' cache is dropped:
-- cascades via a simple trigger on the asset cache table.
CREATE OR REPLACE FUNCTION bottom_up_invalidate_investment_cache_from_asset()
RETURNS trigger AS $$
DECLARE
  v_investment_id uuid;
BEGIN
  SELECT d.deal_id INTO v_investment_id
  FROM repe_asset a
  JOIN repe_deal d ON d.deal_id = a.deal_id
  WHERE a.asset_id = OLD.asset_id
  LIMIT 1;

  IF v_investment_id IS NOT NULL THEN
    DELETE FROM re_investment_cf_series_mat WHERE investment_id = v_investment_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bottom_up_invalidate_investment_from_asset
  ON re_asset_cf_series_mat;
CREATE TRIGGER trg_bottom_up_invalidate_investment_from_asset
  AFTER DELETE ON re_asset_cf_series_mat
  FOR EACH ROW EXECUTE FUNCTION bottom_up_invalidate_investment_cache_from_asset();

COMMENT ON FUNCTION bottom_up_invalidate_asset_cache IS
  'Invalidates re_asset_cf_series_mat for an asset whenever any of its upstream sources (operating, projection, exit_event) change. Next read rebuilds the materialized row via bottom_up_refresh.refresh_asset_cf_series_materialized.';
