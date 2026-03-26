# Meta Prompt — MSA Feature Card → Build Directive

---

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **WPB Downtown / Miami-Wynwood** on **2026-03-23 / 2026-03-24**.

## Feature: CoStar / CBRE Submarket Rent + Vacancy Data Connector

**Category:** data_source
**Priority:** 42.00/100
**Target Module:** data_connectors
**Lineage:** First surfaced in wpb-downtown Zone Intelligence Brief dated 2026-03-23 (brief_id: 8b05bdf7). Research agent explicitly flagged missing Class A/B/C rent breakdown and submarket vacancy as impact-9 gap. Also covers the cap rate / price-per-unit paywalled gap (gap 4 in brief) since both require the same CoStar/CBRE data layer. Applies to all 14 watchlist zones. Priority bumped 2026-03-24: Miami-Wynwood brief confirms rent-by-vintage/class gap in Tier 1 high-growth zone.

## Why This Exists

During the Phase 1 research sweep of WPB Downtown and Miami-Wynwood, the engine needed to retrieve Class A/B/C rent breakdown and submarket vacancy rates, but both are paywalled behind CoStar and CBRE. These are the most critical data points for underwriting multifamily acquisitions. Without them, the composite_acquisition_score is based on market-wide averages rather than submarket-specific data. Building this connector will improve research quality for all 14 watchlist zones, not just the ones that surfaced it.

## Specification

**Inputs:**
- `msa_zone_id` — the zone to query
- `zone geographic boundary (lat/lng bounding box)` — for spatial filtering
- `asset_class: [A, B, C]` — which property classes to retrieve

**Outputs:**
- `asking_rent_per_sf_by_class: dict` — asking rents broken down by A/B/C
- `effective_rent_per_sf_by_class: dict` — effective rents broken down by A/B/C
- `vacancy_rate_by_class: dict` — vacancy rates broken down by A/B/C
- `submarket_name: str` — CoStar submarket ID or name
- `data_source: str` — one of `costar_api | cbre_pdf | realpage_free | web_fallback`
- `data_freshness: date` — when the data was last updated at source

**Acceptance Criteria:**
1. Returns data for at least one asset class for any watchlist zone
2. Graceful degradation: if CoStar API unavailable, attempt CBRE public PDF; if unavailable, flag `data_source=web_fallback` and lower confidence score
3. Connector result stored in `msa_zone_intel_brief.signals.rent_vacancy_data`
4. Unit test: mock CoStar API response → correct extraction of Class B asking rent

**Test Cases:**
- WPB: Class B asking rent expected ~$2.20-2.40/sf per RealPage public data
- Fort Lauderdale: Class A vacancy expected sub-5% per market reports

## Schema Impact

Store in `msa_zone_intel_brief.signals` jsonb under key `rent_vacancy`; no schema change required.

## Files to Touch

- `backend/app/services/data_connectors/costar_connector.py` (new) — Primary connector: CoStar API integration with auth, rate limiting, and response parsing
- `backend/app/services/data_connectors/cbre_pdf_connector.py` (new) — Fallback connector: CBRE Research public PDF extraction using existing OCR/text extraction patterns from `backend/app/services/extraction_engine.py`
- `backend/app/services/msa_rotation_engine.py` — Add connector call during Phase 1 sweep; wire into the existing signal collection pipeline
- `backend/app/services/data_connectors/__init__.py` — Register new connectors in the connector registry

**Existing patterns to follow:**
- Check `backend/app/services/data_connectors/` for existing connector implementations (county assessor, BLS/FRED) to match interface patterns
- PDF extraction should follow the pattern in `backend/app/services/extraction_engine.py`
- Signal storage should match existing jsonb patterns in `msa_zone_intel_brief.signals`

## Data Dependencies

- CoStar API subscription (paid) OR CBRE public research portal
- Zone bounding box coordinates in `msa_zone` table
- RealPage free tier as tertiary fallback

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
3. Read `docs/LATEST.md` for current production status
4. Check existing connectors in `backend/app/services/data_connectors/` for interface patterns
5. Plan the implementation before writing code:
   - Design the connector interface (should match existing connector pattern)
   - Plan the fallback chain: CoStar API → CBRE PDF → RealPage free → web fallback
   - Each fallback should log its attempt and reason for falling through
6. Implement following existing repo patterns
7. Run linters and type checks
8. Stage only changed files (never `git add -A`)
9. Commit with message referencing the MSA feature card:
   ```
   feat(msa): CoStar / CBRE Submarket Rent + Vacancy Data Connector

   Feature Card: 6b8407e7-dc68-44ef-89d4-9a90128b4d32
   Lineage: WPB Downtown brief 2026-03-23, confirmed Miami-Wynwood 2026-03-24. Impact-9 gap affecting all 14 watchlist zones.

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```
10. Push with conflict handling: `git pull --rebase origin main && git push origin main`
11. Update the feature card status in Supabase to `built`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by running at least one test case (mock CoStar response → correct Class B rent extraction)
- Update the card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-{date}.md`
- Note whether this feature would have improved the WPB Downtown research brief that surfaced it (answer: yes — composite_acquisition_score would use submarket-specific rent data instead of market-wide averages)
