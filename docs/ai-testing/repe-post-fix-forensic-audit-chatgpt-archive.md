Meridian REPE — Post-Fix Forensic Audit (archived)
Context
Prior remediation cycles have been applied:

commit e2b16f33 — Authoritative State Lockdown (Phase 0-6): lint, routes, schema, useAuthoritativeState, AuditDrawer, gross-to-net bridge, fee accrual basis fix
migration 433_meridian_ledger_dedup.sql — removed 28 duplicate IGF VII contribution entries, re-seeded MRF III Sovereign Wealth Fund ($85M)
migration 457_fix_capital_ledger_dedup.sql — dual-source ledger dedup, forward-filled asset_quarter_state for 2026Q2+, recomputed fund_quarter_state
migration 458_re_fund_expense_qtr_unique.sql — unique constraint on (env_id, business_id, fund_id, quarter, expense_type)
migration 459_re_authoritative_snapshot_audit.sql — immutable released snapshots, promotion state machine
Despite this, residual symptoms remain: possible duplicate logical funds, unstable aggregate IRRs, NAV double counting, and drift between seeded data, calculation logic, and UI display.

Phase 1 exploration already isolated three code-level defects that explain most of the residual symptoms. This audit will prove them, quantify their blast radius against the Meridian environment, patch them without breaking prior fixes, and emit audit-grade receipts. The goal is a signed answer to: for each Meridian fund, which metrics are trustworthy right now, and which are still unsafe for investor reporting?

Phase 0 is COMPLETE (run 2026-04-11 against live Meridian env, snapshot meridian-20260410T182315Z-3881843b). It surfaced three additional findings beyond the three confirmed defects that must be addressed as first-class phases before Phase 1 comprehensive forensics:

NF-1 — Orphaned fund rows with entity graphs but zero cash events: Two d4560000-... fund rows exist for MCOF I and MREF III, each with 8–11 deals/assets attached but no cash events. These contaminate any rollup JOIN across repe_fund → repe_deal → repe_asset. The active canonical rows are a1b2c3d4-0002-0020-0001-000000000001 (MCOF I) and a1b2c3d4-0001-0010-0001-000000000001 (MREF III). The orphans must be quarantined via migration 462 before Phase 1 forensics runs.
NF-2 — canonical_metrics key mismatch (tvpi vs gross_tvpi): The snapshot builder writes tvpi into the JSONB blob; any code that reads canonical_metrics->>'gross_tvpi' silently gets null. This silent null propagates into DPI, TVPI, IRR computations downstream. Requires a code fix pass (Python + TypeScript) and a new lint scanner in Phase 7.
NF-3 — Snapshot builder beginning_nav = 0: For all Meridian funds the released 2026Q2 snapshot carries beginning_nav = 0 even though MREF III has $765M called. beginning_nav should equal prior quarter's ending_nav. This causes the opening-NAV line in any P&L or period-return calculation to be wrong. Requires a snapshot-builder code fix and a re-promotion pass.
Stale fund_id corrected: The plan previously referenced IGF VII as a1b2c3d4-0003-0030-0001-000000000001. The live env canonical fund_id is a1b2c3d4-0003-0030-0001-000000000001. All references below use the corrected id.

Delivery scope (confirmed)
Single session, Phases 0-11 end to end. Diagnostic receipts and Patches A/B/C/D land together alongside the final confidence report.
Live Meridian env is the authoritative baseline. Phase 0 and Phase 1 forensics query the running backend / Supabase. After each patch lands, the baseline is re-run against the same live env so every number in the final report reflects deployed state, not local fixtures.
Global invariants (enforced from this audit forward)
These are the hard rules. Any code, query, or UI read that violates them is a HARD FAILURE, not a warning. Each invariant is enforced in three places: lint, runtime assertion, and test. If any of the three is missing, the invariant does not exist.

INV-1 — Single source of truth for fund-level financial metrics
For any fund-level metric in {portfolio_nav, gross_irr, net_irr, dpi, rvpi, gross_tvpi, net_tvpi, gross_net_spread, carry, mgmt_fees, fund_expenses}:

Source must be get_authoritative_state(entity_type="fund", ...) or its frontend twin useAuthoritativeState.
Reads from re_fund_quarter_state, re_fund_metrics_qtr, re_cash_event aggregates, or any legacy cache are banned outside the snapshot-builder pipeline.
If state_origin != "authoritative" or promotion_state != "released" → return None with explicit null_reason. No fallback. No legacy reads. No mixed sources.
Enforcement:
Lint: new backend_nav_source_drift scanner (see Phase 7) — bans direct reads of banned tables from anywhere except re_authoritative_snapshots.py and the snapshot-builder.
Runtime: every computed metric carries a source_origin field; a runtime assertion in the serializer rejects responses where any displayed metric is tagged non-authoritative.
Test: test_repe_single_source_of_truth.py — parameterized across all banned call sites, fails CI if any fire.
INV-2 — Period coherence
Every metric composed from multiple inputs must use inputs aligned to the same period (or an explicitly flagged terminal period):

asset_snapshot.quarter == investment_snapshot.quarter == fund_snapshot.quarter for any rollup that contributes to a displayed number.
cash_flow.event_date within the fund IRR timeline must fall within [fund_inception, quarter_end].
Terminal NAV used as the positive terminal cash flow for IRR must belong to the exact terminal period the IRR is computed for.
Forward-filled values (e.g. assets forward-filled by migration 457) must carry a forward_filled=true flag; IRR and NAV readers must either accept the flag explicitly or fail closed.
Enforcement:
Lint: new period_coherence_violation scanner — any rollup query joining two *_quarter_state tables must have quarter = :q on every joined side.
Runtime: rollup_investment, rollup_fund, compute_return_metrics assert every input row's quarter matches the requested quarter before aggregating. Mismatch → PeriodCoherenceError.
Test: test_repe_period_coherence.py — inject a single off-period row, assert the rollup raises and writes no metric.
INV-3 — Cash flow completeness for IRR
No IRR value is computed or displayed unless the input cash flow stream is economically complete:

At least one negative cash flow (contribution / call) AND
At least one positive cash flow (distribution) OR a valid terminal NAV from a released authoritative snapshot.
If not → irr = None, null_reason = "incomplete_cash_flow_series". This replaces the silent "IRR = -90%" noise.
Enforcement:
Runtime: _compute_fund_xirr and _compute_net_xirr early-return None with reason when completeness fails. The XIRR solver is never called on an incomplete series.
Test: test_repe_irr_completeness.py — every permutation of {no calls, no dists, no terminal NAV, all three present} against a fixture fund.
INV-4 — Ownership applied at the edge, exactly once
Ownership is normalized to the asset level before aggregation, not multiplied in during aggregation:

Every asset's NAV/gross/debt/cash is converted to effective_owned_* by walking the ownership chain (repe_asset_entity_link → repe_ownership_edge → fund) at load time.
Rollup aggregation becomes agg_nav += effective_owned_nav with no inline ownership multiplier. One code path, no JV vs direct asymmetry.
Enforcement:
Runtime: rollup_investment asserts abs(effective_ownership_percent - expected_edge_ownership) < 0.01 at the end.
Lint: new ownership_at_aggregation scanner — any occurrence of * ownership inside a rollup aggregation loop is banned.
Test: test_repe_rollup_symmetry.py — builds a fund with one JV asset and one direct asset, same underlying $100M NAV and 50% ownership, asserts both contribute exactly $50M to fund NAV.
INV-5 — UI must respect null, never zero
A missing metric is rendered as null with its null_reason on the UI, never as 0 or a fallback numeric:

Carry tile shows "Net metrics unavailable — waterfall not defined" not $0.
Fund metrics tiles show the null_reason ("authoritative_state_not_released", "out_of_scope_requires_waterfall", "incomplete_cash_flow_series", "period_coherence_violation").
No tile falls back to a stale cached value from re_fund_metrics_qtr.
Enforcement:
Lint: existing no_legacy_repe_reads.py extended to detect || 0 / ?? 0 / Number(x) || 0 coercions on authoritative-state fields inside REPE tiles.
Test: Playwright spec in repo-b/tests/repe/re-fund-null-state.spec.ts — seeds a fund with no waterfall, asserts the tile label says "unavailable" and not "$0".
Confirmed defects (from Phase 1 exploration)
Defect A — Asymmetric ownership weighting in rollup_investment
backend/app/services/re_rollup.py:151-218

JV path (L151-168): agg_nav += nav * ownership, owned_gross_value += gross * ownership, debt_balance += debt * ownership — correctly weighted.
Direct-asset path (L192-218): agg_nav += nav (no ownership), owned_gross_value += asset_value, debt_balance += debt, cash_balance += cash — unweighted.
Mixed investment (JV + direct assets) produces a hybrid NAV where some legs are owned-share and others are 100%.
Downstream: effective_ownership_percent = owned_gross_value / gross_asset_value collapses toward 1.0 when the direct path dominates, masking the asymmetry.
Blast radius: every investment that mixes JV-held assets with direct-held assets. Likely candidates: MRF III, Meridian Credit Opportunities I. Must be verified in Phase 2.
Defect B — Fail-closed violation in waterfall carry
backend/app/services/re_fund_metrics.py:111-128

_compute_waterfall_carry catches (LookupError, ValueError, ImportError) from run_waterfall and falls back to 0.20 * (gross_return - 0.08 * total_called).
Violates docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md Rule 3: waterfall-dependent metrics (carry, promote, gp_share) must return null + null_reason: "out_of_scope_requires_waterfall".
Downstream contamination through re_fund_metrics.py:358-369:
carry_shadow → net_return → net_irr → net_tvpi → gross_net_spread
Every fund without a released waterfall definition currently shows a fake net IRR and fake net TVPI sourced from policy-carry math.
New Finding NF-1 — Orphaned fund rows (Phase 0 discovery)
Orphan rows confirmed in live env:

d4560000-0003-0030-0005-000000000001 — MCOF I orphan (8 deals, 0 cash events)
d4560000-0003-0030-0004-000000000001 — MREF III orphan (11 deals, 0 cash events)
a1b2c3d4-0001-0010-0001-000000000001 — MREF III active row has vintage_year = 2026 (incorrect; must be verified and corrected)
Any JOIN from repe_fund → repe_deal → repe_asset that does not filter to a specific fund_id will double-count the deal/asset rows for both MCOF I and MREF III. Migration 462 must quarantine orphan rows before Phase 1 comprehensive forensics.

New Finding NF-2 — canonical_metrics JSONB key name mismatch (Phase 0 discovery)
The snapshot builder writes tvpi into canonical_metrics. Code that reads canonical_metrics->>'gross_tvpi' gets silent null. Confirmed in live Phase 0 query: the 2026Q2 IGF VII snapshot JSON contains key tvpi with value 1.27, no gross_tvpi key. Any Python service or TypeScript component referencing gross_tvpi from this blob is silently broken. Fix: standardize on tvpi as the canonical key (it is the gross TVPI prior to waterfall), update all readers, add lint scanner.

New Finding NF-3 — Snapshot builder beginning_nav = 0 (Phase 0 discovery)
All live 2026Q2 Meridian snapshots carry beginning_nav = 0. MREF III has $765M called; a beginning NAV of $0 is economically impossible for any non-first-period snapshot. Root cause: the snapshot builder does not look up the prior period's ending_nav to set beginning_nav; it defaults to 0. Fix: in the snapshot-builder pipeline, set beginning_nav = prior_period_ending_nav (from re_authoritative_fund_state_qtr WHERE quarter = prior_quarter AND promotion_state = 'released'). After fix, re-promote affected snapshots.

Defect C — Source-of-truth drift on DPI / TVPI / RVPI
backend/app/services/re_fund_metrics.py:288-313

compute_return_metrics pulls NAV from re_fund_quarter_state (legacy) ordered by created_at DESC, then computes dpi, rvpi, gross_tvpi, gross_return, net_tvpi from that NAV.
The authoritative surface (get_authoritative_state(entity_type="fund", ...) on re_authoritative_fund_state_qtr) is not consulted.
Fund detail page reads canonical NAV via useAuthoritativeState, but DPI/TVPI tiles come from re_fund_metrics_qtr computed against drift. Two tiles on the same page can disagree by the drift amount.
The existing lint verification/lint/no_legacy_repe_reads.py does not detect this because it only scans assistant SQL aggregates and UI symbols, not backend service paths.
Audit workflow (mapped to the 11-phase meta prompt)
All artifacts land under verification/receipts/meridian_forensic_2026-04-11/.

Phase 0 — Baseline snapshot
Goal: prove today's numbers before any change.

Determine the Meridian env_id from 430_meridian_stone_environment_registry.sql.
Write scripts/audit/meridian_baseline.py that runs as a read-only query pack and emits receipts/.../phase0_baseline.json:
For each fund (IGF VII, MRF III, Meridian Credit Opportunities I) at the latest released quarter:
UI value (via GET /api/re/v2/authoritative-state/fund/{fund_id}/{quarter})
Authoritative table value (re_authoritative_fund_state_qtr)
Legacy fund-state value (re_fund_quarter_state — what compute_return_metrics still reads)
Metrics table value (re_fund_metrics_qtr)
Assistant runtime value (call fund_metric_snapshot executor from backend/app/assistant_runtime/)
Metrics captured per source: portfolio_nav, gross_irr, net_irr, dpi, rvpi, gross_tvpi, net_tvpi, gross_net_spread, asset count, investment count.
For each metric, tag plausible (within policy bands) and reconciles_across_sources (all four sources within $1 / 1bp).
Produce receipts/.../phase0_before_after_gaps.md: a three-column table (previously wrong / now fixed / still broken) citing the migrations above.
Phase 0b — Orphaned fund dedup + vintage repair (NF-1)
Goal: quarantine the two orphan d4560000-... fund rows and correct MREF III vintage before any downstream forensic query runs against contaminated data.

Migration 462 — 462_meridian_orphan_fund_dedup.sql:

Quarantine MCOF I orphan:
UPDATE repe_fund
SET name = '[QUARANTINED] ' || name,
    strategy = 'quarantined',
    notes = 'Orphan row — no cash events, entity graph re-parented to canonical a1b2c3d4-0002-0020-0001-000000000001'
WHERE fund_id = 'd4560000-0003-0030-0005-000000000001'
  AND NOT EXISTS (SELECT 1 FROM re_cash_event WHERE fund_id = 'd4560000-0003-0030-0005-000000000001');
Quarantine MREF III orphan (same pattern, fund_id d4560000-0003-0030-0004-000000000001).
Verify vintage_year on MREF III active row; if vintage_year = 2026 correct to the seeded year from 456_meridian_three_fund_seed.sql (confirm source-of-truth vintage before writing).
re_assign any re_jv_quarter_state, re_asset_quarter_state, repe_deal rows linked to orphan fund_ids to the canonical fund_ids via ON CONFLICT DO NOTHING insert into canonical + delete from orphan.
Migration must be idempotent (DO $$ ... END $$ with existence checks). Follow pattern from migration 433.

Output: receipts/.../phase0b_dedup_migration.md — row counts before/after for each quarantined entity.

Phase 0c — Canonical metrics key standardization (NF-2)
Goal: eliminate the silent null produced by canonical_metrics->>'gross_tvpi' everywhere in the codebase.

Inventory all readers — grep Python and TypeScript for gross_tvpi in any context that reads from canonical_metrics, authoritative_state, or re_authoritative_fund_state_qtr:
grep -rn "gross_tvpi" backend/ repo-b/src/ --include="*.py" --include="*.ts" --include="*.tsx"
Decide canonical key — tvpi is the existing key in the blob (confirmed Phase 0). The key name tvpi maps to gross TVPI (before waterfall carry). Rename readers to use tvpi; net_tvpi stays net_tvpi. No migration needed to rename the blob key (it already is tvpi).
Code fix pass — update every reader of canonical_metrics.gross_tvpi → canonical_metrics.tvpi.
Lint scanner (Phase 7 addition) — canonical_metrics_key_drift scanner: any occurrence of canonical_metrics.*gross_tvpi in Python string literals or TypeScript template literals → HARD FAILURE.
Emit receipts/.../phase0c_key_standardization.md listing every changed call site.
Phase 0d — Snapshot builder beginning_nav carry-forward (NF-3)
Goal: fix beginning_nav = 0 in all released Meridian snapshots so period-return calculations have a valid opening NAV.

Root cause in snapshot builder — read backend/app/services/re_authoritative_snapshots.py and locate where beginning_nav is set. Expected location: the function that computes per-period canonical_metrics. Confirm it does not look up the prior period's ending_nav.
Fix — before computing the current-period snapshot, look up:
prior = get_authoritative_state(entity_type="fund", entity_id=fund_id, quarter=prior_quarter)
beginning_nav = prior.ending_nav if prior and prior.promotion_state == "released" else Decimal("0")
For the very first period (no prior released snapshot), beginning_nav = 0 is correct and should be flagged first_period=true.
Re-promotion — after fix, invalidate and re-promote the affected 2026Q2 snapshots for all three Meridian funds. Use the released_state_lock promotion pathway from migration 459; do not directly UPDATE promotion_state.
Verification query — after re-promotion, assert beginning_nav > 0 for any fund where paid_in_capital > 0 and quarter != fund_inception_quarter.
Emit receipts/.../phase0d_beginning_nav_fix.md with before/after values per fund.
Phase 1 — Duplicate entity forensics
Goal: prove whether duplicate logical funds or ownership rows contaminate Meridian rollups.

Run read-only queries in scripts/audit/meridian_duplicate_forensics.sql:

repe_fund logical dupes (no DB unique constraint):
SELECT business_id, lower(name), vintage_year, strategy, count(*), array_agg(fund_id)
FROM repe_fund
WHERE business_id = :meridian_business_id
GROUP BY 1,2,3,4 HAVING count(*) > 1;
repe_deal dupes per fund ((fund_id, lower(name))).
repe_asset dupes per deal ((deal_id, lower(name), property_type)).
repe_asset_entity_link — duplicate (asset_id, entity_id, role) on the same effective_from.
repe_ownership_edge — SUM(percent) per from_entity_id at latest effective date; flag > 1.0 + epsilon.
re_cash_event — (fund_id, event_date, event_type, amount, partner_id) count > 1.
re_authoritative_*_state_qtr — duplicate (entity_id, quarter) where promotion_state = 'released'. Should be impossible under the trigger from migration 459; if found → trigger regression.
re_jv.ownership_percent — sum per asset/investment > 1.0.
re_fund_quarter_state — multiple rows for same (fund_id, quarter) where created_at differs; this is the drift input for Defect C and must be characterized.
Output: receipts/.../phase1_duplicates.csv with every offending row and receipts/.../phase1_summary.md classifying each finding as data | join_multiplication | both.

Phase 2 — Rollup multiplication audit
Goal: prove whether each metric traverses the hierarchy exactly once per economic interest.

For each Meridian investment, run rollup_investment dry-run and print:
JV-path NAV contribution (weighted)
Direct-asset-path NAV contribution (unweighted — this is Defect A)
effective_ownership_percent vs. expected ground-truth from repe_ownership_edge
Independent NAV recompute in scripts/audit/meridian_independent_nav.py:
Start from re_asset_quarter_state.nav
Walk ownership chain via repe_asset_entity_link + repe_ownership_edge
Apply each ownership split exactly once
Aggregate up to fund
Compare to:
rollup_investment result
re_fund_quarter_state
re_authoritative_fund_state_qtr
Any divergence > $1 → classify as JOIN MULTIPLICATION ISSUE or LOGIC ISSUE.
Output: receipts/.../phase2_rollup_tie_out.csv and phase2_rollup_report.md.

Phase 3 — Fund-level receipts trace (Institutional Growth Fund VII)
Goal: every displayed metric has a traceable formula + inputs.

For IGF VII (fund_id a1b2c3d4-0003-0030-0001-000000000001) at the latest released quarter, emit receipts/.../phase3_igf7_receipts.md with one row per metric:

Metric	Formula	Raw inputs	Intermediate	Final	Source
Metrics: portfolio_nav, gross_irr, net_irr, dpi, rvpi, gross_tvpi, net_tvpi, mgmt_fees, fund_expenses, carry_shadow, gross_return, net_return. Any metric that cannot be fully traced → flagged UNEXPLAINED METRIC FAILURE.

Phase 4a — Period integrity + cash flow completeness (pre-IRR gate)
Goal: before touching IRR math, prove the inputs are economically and temporally coherent. This is the INV-2 / INV-3 enforcement pass.

Period integrity check — for each fund at the target quarter:
Every re_asset_quarter_state row contributing to rollup has quarter = target_quarter
Every re_jv_quarter_state row has quarter = target_quarter
No row carries forward_filled=true without an explicit acceptance flag on the reader
Terminal NAV used for IRR belongs to the exact terminal period
Every re_cash_event.event_date falls within [fund_inception, quarter_end]
Any violation → HARD FAILURE: PERIOD INTEGRITY BREACH with offending row cited
Cash flow completeness check — for each fund/investment:
has_negative_cash_flow = EXISTS(re_cash_event WHERE fund_id=:f AND event_type='CALL')
has_positive_cash_flow = EXISTS(re_cash_event WHERE fund_id=:f AND event_type='DIST') OR terminal_nav IS NOT NULL
If NOT (has_negative_cash_flow AND has_positive_cash_flow) → classify as INCOMPLETE_CASH_FLOW_SERIES, set irr = None, reason incomplete_cash_flow_series
This alone will silence most of the "-90% IRR" noise before IRR math is even attempted
Gate effect — Phase 4b (IRR revalidation) only runs against funds that pass 4a. Funds that fail are listed in the final report as IRR unavailable by design with the specific gate that rejected them.
Output: receipts/.../phase4a_period_integrity.csv and phase4a_cash_flow_completeness.csv.

Phase 4b — IRR forensic revalidation
Goal: for funds that passed Phase 4a, prove whether the IRR engine itself is sound or whether the (complete, aligned) inputs are still contaminated.

For each Meridian fund that passed Phase 4a, extract the full re_cash_event timeline plus terminal NAV from re_authoritative_fund_state_qtr (INV-1).
Independently recompute XIRR in scripts/audit/meridian_independent_xirr.py using numpy_financial.irr with a different solver than backend/app/finance/irr_engine.py (the production engine is a deterministic binary search).
Compare four values per fund: stored, backend-calculated, independently-recalculated, UI-rendered.
If they differ → classify the error as one of duplicate_cash_flow | missing_inflow | missing_exit | period_timing | sign_error | stale_cache | duplicate_entity_contamination.
Apply sanity rules (SOFT — these are flags for review, not hard failures, since a real fund can legitimately have early-life negative IRR):
IRR < -20% without explicit justification → flag for review
high occupancy + positive NOI + stable leverage + IRR < -20% → HARD FAILURE (economically impossible)
Because of Defect B, net_irr is expected to be fake anywhere the fund has no released waterfall definition. Phase 4b must classify the divergence as the downstream of Defect B, not as a new IRR bug. Post-Patch B, these funds should return net_irr = None.
Output: receipts/.../phase4b_irr_revalidation.csv.

Phase 5 — NAV reconciliation
Goal: asset → investment → fund → portfolio all tie.

For each fund produce phase5_nav_reconciliation.csv with columns:

asset_nav_subtotal (sum of re_asset_quarter_state.nav, NULL-excluded per test_repe_canonical_rollup.py)
jv_nav_subtotal (after ownership weighting)
investment_nav_subtotal (from rollup_investment — suspect for Defect A)
fund_nav_from_legacy (re_fund_quarter_state.portfolio_nav)
fund_nav_from_authoritative (re_authoritative_fund_state_qtr.canonical_metrics.ending_nav)
portfolio_nav_aggregate (sum across non-quarantined funds)
Mismatch reason column
Exited assets and pipeline assets must be excluded using the same rules as test_repe_canonical_rollup.py.

Phase 6 — Waterfall / capital account / distribution validation
Goal: prove DPI and TVPI reconcile (or explicitly fail closed).

Rebuild the distribution logic per fund: contributions, return of capital, preferred return, GP catch-up, promote, distributions. Treat fund-level capital accounts as the ledger source.
Validate:
DPI = cumulative_distributions / paid_in_capital
TVPI = (NAV + distributions) / paid_in_capital
Defect B confirmation: every call to compute_return_metrics that hits _compute_waterfall_carry's fallback branch should be enumerated. For each such fund:
Record the fake carry_shadow value
Record the downstream contamination of net_return, net_irr, net_tvpi, gross_net_spread
Classify as WATERFALL DEFECT + FAIL-CLOSED VIOLATION
Output: receipts/.../phase6_waterfall_check.md + phase6_capital_accounts.csv.

Phase 7 — Data quality rule engine
Goal: encode the Global Invariants (INV-1 through INV-5) as lint + runtime + tests so future regressions cannot reintroduce the defects found here.

Extend verification/lint/no_legacy_repe_reads.py with six new scanners:

backend_nav_source_drift (HARD — INV-1): any backend file under backend/app/services/ that computes dpi | rvpi | tvpi | gross_tvpi | net_tvpi without sourcing nav from re_authoritative_fund_state_qtr or get_authoritative_state. Allowlist: re_authoritative_snapshots.py and the snapshot-builder pipeline.
banned_legacy_table_reads (HARD — INV-1): any read from re_fund_quarter_state, re_fund_metrics_qtr, or raw re_cash_event aggregates for fund-level metrics from outside the snapshot builder.
period_coherence_violation (HARD — INV-2): any rollup SQL joining two *_quarter_state tables without quarter = :q on every joined side, or any Python loop that aggregates quarter_state rows without first filtering by the requested quarter.
ownership_at_aggregation (HARD — INV-4): any * ownership / * ownership_percent multiplication inside a rollup aggregation loop. Must be pre-normalized via resolve_effective_ownership.
fail_closed_violation (HARD — INV-5): any except block around run_waterfall that returns a non-None numeric value; any || 0 / ?? 0 / Number(x) || 0 coercion on an authoritative-state field inside REPE tiles.
ui_fallback_to_stale_metrics (HARD — INV-1 + INV-5): any React component in repo-b/src/app/lab/env/[envId]/re/ that imports both useAuthoritativeState and getReV2FundQuarterState / re_fund_metrics_qtr fetchers with a fallback pattern (state ?? legacy).
canonical_metrics_key_drift (HARD — NF-2): any occurrence of canonical_metrics.*gross_tvpi in Python string literals or TypeScript property accesses. The canonical key is tvpi; gross_tvpi is the wrong key and silently returns null. No allowlist — there is no legitimate use of gross_tvpi as a JSONB key.
Soft warnings: IRR < -20% without supporting comment, high occupancy + negative IRR, stale exit assumptions (>4 quarters), gross/net spread > 500bps without fee support.

Each rule output: entity | period | severity | evidence | suggested_remediation. Extend backend/tests/test_state_lock_invariants.py with one test per HARD rule that fails CI if the rule fires.

Phase 8 — Root cause classification
For every finding from Phases 0-7, classify into one or more of: DATA | SEEDING | LOGIC | QUERY_JOIN_MULTIPLICATION | TIMING | DUPLICATE_ENTITY | STALE_CACHE | MISSING_EXIT_VALUE | WATERFALL_DEFECT | UI_SOURCE_MISMATCH. Output receipts/.../phase8_root_causes.json.

Expected preliminary classification:

Defect A → LOGIC + QUERY_JOIN_MULTIPLICATION
Defect B → WATERFALL_DEFECT + LOGIC
Defect C → UI_SOURCE_MISMATCH + LOGIC
Phase 9 — Targeted patches (minimum viable, regression-safe)
Each patch ships with: root cause, exact fix, why prior fixes did not solve it, before/after numbers, regression risk, test, cache invalidation step.

Patch A — Ownership normalization at the edge in backend/app/services/re_rollup.py

The fix is not to add * ownership to the direct-asset path. That would preserve the dual-path anti-pattern. The fix is to eliminate the dual path entirely.
New helper resolve_effective_ownership(asset_id) -> Decimal walks repe_asset_entity_link → repe_ownership_edge → fund once at load time and returns the fully-composed ownership fraction from asset to fund.
At the top of rollup_investment, every asset row is converted to an EffectiveOwnedAsset record with pre-multiplied effective_nav, effective_gross, effective_debt, effective_cash. JV-held assets and direct-held assets produce the same shape.
Aggregation loop becomes:
for a in effective_owned_assets:
    agg_nav += a.effective_nav
    gross_asset_value += a.effective_gross
    debt_balance += a.effective_debt
    cash_balance += a.effective_cash
No * ownership anywhere inside the aggregation loop. INV-4 is structurally enforced.
Runtime invariant at the end: abs(sum(a.effective_nav) / sum(a.raw_nav) - expected_edge_ownership) < 0.01. Fail-closed with OwnershipInvariantError if violated.
Why this matters (per feedback): applying ownership inside aggregation preserves the bug vector. Normalizing at the edge means any future refactor of the aggregation loop cannot reintroduce asymmetry.
Patch B — Fail closed on waterfall (runtime + UI) in backend/app/services/re_fund_metrics.py:111-128

Remove the 20%-above-8% fallback. The except block becomes carry = None; null_reasons["carry"] = "out_of_scope_requires_waterfall" and nothing else.
Downstream propagation: net_return, net_irr, net_tvpi, gross_net_spread must return None whenever carry is None. The existing gross-to-net bridge already supports null_reasons; extend compute_return_metrics to propagate them into re_fund_metrics_qtr via a new null_reasons JSONB column (migration 464_re_fund_metrics_null_reasons.sql).
UI behavior (INV-5, critical addition): the fund detail page's net metrics tiles must render "Net metrics unavailable — waterfall not defined" instead of $0 or —. Specifically:
repo-b/src/components/re/FundKpiTiles.tsx (or equivalent) must route null net metrics through an Unavailable