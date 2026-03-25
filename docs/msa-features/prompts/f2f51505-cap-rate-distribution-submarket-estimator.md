# Meta Prompt — Cap Rate Distribution by Asset Class — Submarket Estimator

**Feature Card:** f2f51505-b1c1-4227-acf2-90aa9b9c69d0
**Generated:** 2026-03-24
**Priority:** 44.1/100
**Status:** prompted

---

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **Miami — Wynwood/Edgewater** on **2026-03-24** (brief_id: 04f9abb1-a2a9-4681-83a9-62f6a5bc5a70).

## Feature: Cap Rate Distribution by Asset Class — Submarket Estimator

**Category:** calculation
**Priority:** 44.1/100
**Target Module:** MSA Intelligence — Zone Brief Scorer
**Lineage:** First identified in Miami-Wynwood brief 2026-03-24 (Tier 1 zone, mixed asset focus). Cap rate gap affects all analyzed signal categories — universal across zones. Cross-zone frequency 9/10. The brief captured actual comp transactions ($180M office at 545Wyn, $72M multifamily at Wynwood Norte) that contain derivable cap rate data, but no engine currently extracts and presents them as cap rate estimates.

## Why This Exists

During the Phase 1 research sweep of Miami — Wynwood/Edgewater, the engine identified closed comp transactions with enough data to estimate zone-level cap rates by asset class — but currently only metro-level cap rates (from public sources) are available without a CoStar/RCA subscription. This capability does not currently exist in Winston. Building it will improve research quality for all zones with comp data in their briefs — estimated frequency 9/10 zones. The Miami-Wynwood brief alone has 3 usable comps spanning office, multifamily, and land.

## Specification

**Inputs:**
- `closed_comps` array — extracted from zone brief `signals.comps` or `key_findings`; each comp has:
  - `price` (float, USD)
  - `noi` (float, optional — annual NOI if available)
  - `price_per_unit` (float, optional — for multifamily)
  - `asset_class` (str: multifamily|mixed-use|office|retail|land)
  - `sf` (float, optional — square footage for office/retail)
  - `address` (str)
- `asset_class` filter (str) — which asset class to estimate
- `msa_zone_id` (UUID) — for context and storage
- `market_cap_rate_benchmark` (dict, optional) — metro-level cap rate by asset class from brief signals; used as anchor when comp set is thin

**Outputs:**
- `cap_rate_estimate` (float) — midpoint cap rate estimate for the asset class
- `confidence_band_low` (float) — low end of the cap rate range
- `confidence_band_high` (float) — high end of the cap rate range
- `comp_count` (int) — number of comps used in the estimate
- `methodology_note` (str) — one-sentence explanation: e.g., "Based on 2 closed comps in Wynwood; anchored to Miami metro 5.5% average."
- `asset_classes_available` (list[str]) — list of asset classes for which estimates were produced (so UI can display all in one call)

**Acceptance Criteria:**
- Produces cap rate estimate within 50bps of market consensus when 3+ comps available for the asset class
- Gracefully degrades to metro average with confidence note when fewer than 3 comps present (confidence_band widens; methodology_note explains fallback)
- Displays inline in the Zone Intelligence Brief card in the UI
- Updates automatically when new comps are added to a brief (service re-runs on brief update)
- Works for all asset classes in the schema: multifamily, office, mixed-use, retail (land excluded from cap rate estimation)
- Returns `cap_rate_estimate = None` for asset classes with zero comps and no metro benchmark available (does not crash)

**Test Cases:**
1. **Miami-Wynwood office:** `comps=[{price: 180_000_000, sf: 500_000, asset_class: "office"}]` (545Wyn) → implied cap rate ~5.8–6.2% (NOI derived from market rent assumption + expense ratio); confidence_band widens to ±75bps with 1 comp
2. **Miami-Wynwood multifamily:** `comps=[{price: 72_000_000, price_per_unit: None, asset_class: "multifamily"}, {price: 33_500_000, asset_class: "land"}]` → multifamily estimate uses Wynwood Norte implied yield; land excluded; `comp_count=1` for multifamily
3. **No comps, metro benchmark available:** `comps=[]`, `market_cap_rate_benchmark={"multifamily": 0.055}` → returns `cap_rate_estimate=0.055`, `confidence_band=[0.05, 0.06]`, `methodology_note="No zone comps; using Miami metro benchmark"`, `comp_count=0`
4. **No comps, no benchmark:** `comps=[]`, `market_cap_rate_benchmark=None` → returns `cap_rate_estimate=None`, `comp_count=0`, no exception

## Schema Impact

Add `cap_rate_estimates` JSONB column to `msa_zone_intel_brief`. No new tables needed.

Create migration: `repo-b/db/schema/420_msa_cap_rate_estimates.sql`

```sql
-- 420_msa_cap_rate_estimates.sql
ALTER TABLE msa_zone_intel_brief
  ADD COLUMN IF NOT EXISTS cap_rate_estimates JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN msa_zone_intel_brief.cap_rate_estimates IS
  'Cap rate estimates by asset class, derived from closed comps in the brief. Computed by msa_brief_scorer.cap_rate_estimator().';
```

## Files to Touch

**New files to create:**
- `backend/app/services/msa_brief_scorer.py` — new service with a `cap_rate_estimator` function
  - Function signature: `cap_rate_estimator(msa_zone_id: str, closed_comps: list[dict], asset_class: str, market_cap_rate_benchmark: dict | None = None) -> dict`
  - Also expose: `estimate_all_asset_classes(msa_zone_id, closed_comps, market_cap_rate_benchmarks) -> dict` — runs estimator for all asset classes found in comps and returns a consolidated dict suitable for storing in `cap_rate_estimates` JSONB
  - Include simple cap rate derivation logic: if NOI available → `cap_rate = NOI / price`; if multifamily with no NOI → use market rent × unit count × (1 - expense_ratio) / price; if office with SF only → use market rent/SF × SF × (1 - expense_ratio) / price; market rent constants should come from brief signals or hardcoded Miami/national benchmarks as fallback
- `repo-b/db/schema/420_msa_cap_rate_estimates.sql` — migration file (content above)
- `repo-b/src/components/msa/CapRateEstimatePanel.tsx` — small UI component to display cap rate estimates inline in Zone Brief card
  - Props: `{ cap_rate_estimates: Record<string, any> | null }`
  - Renders a compact table: asset class | estimated cap rate range | comp count | confidence note
  - Shows "No comp data" gracefully when null

**Files to modify:**
- `backend/app/services/msa_rotation_engine.py` — after brief write, call `msa_brief_scorer.estimate_all_asset_classes()` with comps from brief signals; store result in `msa_zone_intel_brief.cap_rate_estimates`
- `repo-b/src/app/lab/env/[envId]/msa/page.tsx` — import and render `<CapRateEstimatePanel cap_rate_estimates={latestBrief?.cap_rate_estimates ?? null} />` in the Zone Brief detail section

**Do NOT touch:**
- `backend/app/services/ai_gateway.py`
- Any credit, PDS, or non-MSA services
- The existing financial modeling suite (IRR, Monte Carlo) — this is submarket-level, not deal-level

## Implementation Instructions

1. Read `CLAUDE.md` — this feature routes to `agents/bos-domain.md` for the service, `agents/data.md` for the migration, and `agents/frontend.md` for the UI panel
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm no cap rate estimator exists for the MSA surface (it does not; the existing `stress testing (cap rate)` in REPE financial modeling is deal-level, not submarket-level)
3. Read `docs/LATEST.md` — MSA environment OPERATIONAL; check if Stone PDS or Meridian changes are in flight that might conflict with migration numbering (next available migration should be 419 or 420 depending on absorption model migration)
4. Read `repo-b/db/schema/418_msa_rotation_engine.sql` — understand `msa_zone_intel_brief` structure before adding column
5. Check latest migration number: `ls repo-b/db/schema/ | sort | tail -5` — use the next available number for the cap rate migration
6. Read `docs/msa-intel/miami-wynwood-2026-03-24.json` or `docs/msa-intel/miami-wynwood-2026-03-24.md` — understand what comp data the brief actually captured (545Wyn $180M, Wynwood Norte $72M, land $33.5M)
7. Implement `msa_brief_scorer.py` with clean Python typing; keep the cap rate derivation logic transparent and commented
8. Apply the schema migration via Supabase MCP or direct SQL
9. Implement `CapRateEstimatePanel.tsx` following existing component patterns in `repo-b/src/components/`
10. Run `ruff check backend/` and `tsc --noEmit` from `repo-b/` before committing
11. Stage only changed files
12. Commit:
    ```
    feat(msa): cap rate estimator by asset class from zone brief comps

    Feature Card: f2f51505-b1c1-4227-acf2-90aa9b9c69d0
    Lineage: Miami-Wynwood brief 04f9abb1 — 3 comps with derivable cap rates
    Adds: msa_brief_scorer.py, cap_rate_estimates column, CapRateEstimatePanel

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
13. Push: `git pull --rebase origin main && git push origin main`
14. Update feature card status:
    ```sql
    UPDATE msa_feature_card SET status = 'built', updated_at = now() WHERE card_id = 'f2f51505-b1c1-4227-acf2-90aa9b9c69d0';
    ```

## Proof of Execution

After building, the coding agent must:
- Run test case 1 (Miami-Wynwood office comp: $180M / 500K SF) and confirm output is a reasonable cap rate in the 5.5–6.5% range
- Run test case 4 (no comps, no benchmark) and confirm no exception is raised
- Update card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-24.md` noting whether the Wynwood cap rate estimates would have materially improved the brief quality

## Dependency Note

This feature is **fully independent** — it does not depend on the absorption model (card 7e571201) or the supply pipeline chart (card 03a36c0e). It can be built in parallel with either of those cards. The only dependency is that `msa_zone_intel_brief` rows exist with comp data in their `signals` JSONB — which is true for Miami-Wynwood as of 2026-03-24.
