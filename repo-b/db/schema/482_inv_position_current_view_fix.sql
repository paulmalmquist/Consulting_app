-- 482_inv_position_current_view_fix.sql
-- Bug found during Phase 1 smoke verification: inv_position_current showed open_qty=100 for
-- a position that had been fully relieved (actual open = 0).
--
-- Cause: the original view in 475 LEFT JOINed inv_position_lot ⨝ inv_position_lot_relief
-- and aggregated. When a lot has N reliefs, the JOIN produces N copies of the lot row, so
-- SUM(l.open_qty_initial) over-counts by a factor of N. COUNT(DISTINCT l.id) accidentally
-- saved lot_count, but open_qty had no DISTINCT and computed (N × open_initial) − Σ relief.
--
-- Fix: aggregate reliefs per lot first (CTE), then subtract per lot, then aggregate per
-- position. No JOIN multiplication.
--
-- Idempotent. Depends on 475.

CREATE OR REPLACE VIEW inv_position_current AS
WITH lot_relief_total AS (
    SELECT lot_id, SUM(qty_relieved) AS qty_relieved_total
    FROM inv_position_lot_relief
    WHERE voided_by_id IS NULL
    GROUP BY lot_id
),
lot_state AS (
    SELECT
        l.env_id,
        l.business_id,
        l.account_id,
        l.security_id,
        l.id AS lot_id,
        l.open_event_date,
        l.open_qty_initial - COALESCE(r.qty_relieved_total, 0) AS lot_open_qty,
        l.cost_basis_native
    FROM inv_position_lot l
    LEFT JOIN lot_relief_total r ON r.lot_id = l.id
)
SELECT
    env_id,
    business_id,
    account_id,
    security_id,
    SUM(lot_open_qty)            AS open_qty,
    SUM(cost_basis_native)        AS gross_cost_basis_native,
    MIN(open_event_date)          AS earliest_open_date,
    MAX(open_event_date)          AS latest_open_date,
    COUNT(*)                      AS lot_count
FROM lot_state
GROUP BY env_id, business_id, account_id, security_id;

COMMENT ON VIEW inv_position_current IS
    'Investment Engine: derived current state per (account, security). Reliefs aggregated per lot first to avoid the JOIN-multiplication bug present in 475. V1 ships as a regular view; promote to materialized view if read load demands.';
