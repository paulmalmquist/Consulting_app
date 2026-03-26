# Meta Prompt — MSA Feature Card → Build Directive

---

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **WPB Downtown** on **2026-03-23**, confirmed in **Miami-Wynwood** on **2026-03-24**.

## Feature: Trepp / CREFC CMBS Delinquency Rate Connector for MSA Zones

**Category:** data_source
**Priority:** 34.00/100
**Target Module:** data_connectors
**Lineage:** First surfaced in wpb-downtown Zone Intelligence Brief dated 2026-03-23 (brief_id: 8b05bdf7). Research agent identified CMBS delinquency gap with impact 7. Key brief finding: 2026 refinancing wall with $162.1B multifamily maturities nationally. Applies to FL, TX, AZ, CO, GA zones (8/14 zones with significant CMBS multifamily exposure). Priority bumped 2026-03-24: Miami-Wynwood brief confirms CMBS delinquency data gap persists in Tier 1 markets.

## Why This Exists

Winston has no CMBS delinquency data at the MSA or submarket level. The 2026 CRE refinancing wall is pushing $162.1B in multifamily maturities nationally, and CMBS stress signals are an early warning indicator for distressed acquisition opportunities. During the Phase 1 research sweep of WPB Downtown, the engine could not assess CMBS-related distress risk for the zone. Building this connector will improve research quality for 8 out of 14 watchlist zones with significant CMBS multifamily exposure (FL, TX, AZ, CO, GA).

## Specification

**Inputs:**
- `msa_zone_id` — the zone to query
- `msa_name` — MSA name string for Trepp API market query
- `lookback_months: int` — how far back to look (default: 12)

**Outputs:**
- `cmbs_delinquency_rate_multifamily: float` — delinquency rate as percentage
- `cmbs_maturities_next_12m_bn: float` — maturing CMBS loans in next 12 months (billions)
- `distressed_loan_count: int` — count of distressed CMBS loans in the MSA
- `data_source: str` — one of `trepp_api | crefc_pdf | web_fallback`
- `report_date: date` — date of the source report

**Acceptance Criteria:**
1. Returns delinquency rate for multifamily CMBS in the MSA
2. CREFC PDF fallback: extract national MF rate when MSA-level unavailable
3. Result stored in `msa_zone_intel_brief.signals.cmbs_data`
4. If Trepp unavailable and CREFC unavailable, log `data_gap` warning and proceed with brief

**Test Cases:**
- WPB: national MF CMBS delinquency ~4-6% per 2026 CREFC report (fallback)
- Dallas: Trepp API should return TX market delinquency rate if subscribed

## Schema Impact

Store in `msa_zone_intel_brief.signals` jsonb under key `cmbs_data`; no schema change required.

## Files to Touch

- `backend/app/services/data_connectors/trepp_connector.py` (new) — Primary connector: Trepp commercial API integration with auth, MSA-level market query, and response parsing
- `backend/app/services/data_connectors/crefc_pdf_connector.py` (new) — Fallback connector: CREFC monthly delinquency report PDF extraction. CREFC publishes a standardized PDF monthly; parse the multifamily delinquency table.
- `backend/app/services/msa_rotation_engine.py` — Add CMBS connector call to Phase 1 sweep pipeline, alongside the existing signal collectors

**Existing patterns to follow:**
- Check `backend/app/services/data_connectors/` for existing connector implementations to match interface patterns
- PDF extraction should follow the pattern in `backend/app/services/extraction_engine.py`
- Signal storage should match existing jsonb patterns in `msa_zone_intel_brief.signals`
- The CoStar connector (if built first — card 6b8407e7) establishes the data_connector interface; follow the same pattern

**Implementation notes:**
- Trepp API is a paid service; the connector should work with or without an API key
- CREFC monthly reports are publicly available PDFs with a consistent table format
- National-level data is always available as a floor; MSA-level is premium
- Consider caching CREFC PDF extraction results monthly since the report only updates monthly

## Data Dependencies

- Trepp API subscription (paid) OR CREFC public monthly report PDF
- CMBS data is national/MSA level — submarket granularity available via Trepp only

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
3. Read `docs/LATEST.md` for current production status
4. Check existing connectors in `backend/app/services/data_connectors/` for interface patterns
5. Plan the implementation before writing code:
   - Design the connector to match the existing data_connector interface
   - Plan the fallback chain: Trepp API → CREFC PDF → web fallback
   - CREFC PDF parsing: identify the table structure for multifamily delinquency rates
6. Implement following existing repo patterns
7. Run linters and type checks
8. Stage only changed files (never `git add -A`)
9. Commit with message referencing the MSA feature card:
   ```
   feat(msa): Trepp / CREFC CMBS Delinquency Rate Connector

   Feature Card: d1de8210-27cb-45ca-9179-a988da77f1ed
   Lineage: WPB Downtown brief 2026-03-23, confirmed Miami-Wynwood 2026-03-24. CMBS delinquency gap affects 8/14 watchlist zones.

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```
10. Push with conflict handling: `git pull --rebase origin main && git push origin main`
11. Update the feature card status in Supabase to `built`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by running at least one test case (mock CREFC PDF → correct national MF delinquency rate extraction)
- Update the card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-{date}.md`
- Note whether this feature would have improved the WPB Downtown research brief that surfaced it (answer: yes — CMBS stress signals would have informed the distressed-opportunity section of the brief)
