# Meta Prompt — MSA Feature Card → Build Directive

---

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **Miami-Wynwood** on **2026-03-24**.

## Feature: Agency Lending Volume Tracker — Fannie/Freddie by MSA Zone

**Category:** data_source
**Priority:** 18.00/100
**Target Module:** MSA Intelligence — Data Collectors
**Lineage:** First identified: Miami-Wynwood brief 2026-03-24. Capital availability signal had null agency_volume_delta. FHFA public disclosure data is available but unprocessed. Cross-zone frequency 6/10 — relevant for all multifamily-focused zones.

## Why This Exists

During the Phase 1 research sweep of Miami-Wynwood, the engine needed Fannie Mae and Freddie Mac multifamily loan origination data at the MSA or ZIP level to quantify the `agency_volume_delta` in the capital_availability signal. The signal returned null because this data source has never been connected. FHFA publicly discloses this data but it requires parsing their CSV disclosure files. This capability does not currently exist in Winston. Building it will improve research quality for 6 out of 10 zones (all multifamily-focused zones), not just the one that surfaced it.

## Specification

**Inputs:**
- `msa_zone_id` — the zone to pull data for
- `fips_code` or `zip_codes` — geographic identifier for FHFA data lookup
- `year` and `quarter` — temporal filter

**Outputs:**
- `agency_loan_count` — number of agency multifamily loans in the period
- `agency_volume_dollars` — total dollar volume of agency lending
- `yoy_delta_pct` — year-over-year change percentage
- `data_vintage` and `source` — metadata about freshness and origin

**Acceptance Criteria:**
1. Returns agency loan volume for Miami MSA from FHFA public disclosure files
2. Handles quarterly FHFA HMDA/multifamily loan disclosure CSV files
3. Maps metro-level data to zone with appropriate confidence note
4. Feeds `agency_volume_delta` in capital_availability signal

**Test Cases:**
1. MSA: miami, Year: 2025 → Expected: `agency_loan_count > 0`

## Schema Impact

Add `agency_volume_ytd` JSONB column to zone_brief capital_availability signal. No new tables required — this enriches the existing zone_brief data structure.

## Files to Touch

- `backend/app/services/msa_data_collectors.py` — **ADD** new `fhfa_agency_volume_puller` function following existing collector patterns

### Additional files to read for context:
- `backend/app/services/msa_data_collectors.py` — existing data collector functions (follow patterns for error handling, caching, return format)
- `backend/app/services/msa_zone_brief.py` — the zone brief service that consumes this data in the capital_availability signal
- `backend/app/services/msa_zone_brief.py` — search for `agency_volume_delta` to see where this data plugs in
- `backend/app/routes/msa_routes.py` — may need a manual refresh endpoint

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
3. Read `docs/LATEST.md` for current production status
4. Plan the implementation before writing code
5. **Research FHFA data sources:** The FHFA publishes multifamily loan-level disclosure data. Key sources:
   - Fannie Mae Multifamily Loan Performance Data: https://capitalmarkets.fanniemae.com/credit-risk-transfer/multifamily-credit-risk-transfer/multifamily-loan-performance-data
   - Freddie Mac Multifamily Loan-Level Dataset: https://www.freddiemac.com/research/datasets/sf-loanlevel-dataset
   - FHFA Loan Level Census Tract File: check https://www.fhfa.gov/data
6. **Build the puller function:** In `msa_data_collectors.py`, add `async def fhfa_agency_volume_puller(fips_code: str, year: int, quarter: int) -> dict`. Follow the existing collector pattern (return dict with data + metadata + confidence).
7. **CSV parsing:** Use pandas to parse FHFA disclosure CSVs. Filter by MSA FIPS code. Aggregate loan counts and volumes by quarter. Calculate YoY delta.
8. **Caching:** Cache parsed FHFA data locally (these files change quarterly, not daily). Store in a temp/cache directory or use the existing caching pattern from other collectors.
9. **Integration:** Wire the puller into the zone brief's capital_availability signal builder. When `fhfa_agency_volume_puller` returns data, populate `agency_volume_delta` instead of leaving it null.
10. **Confidence notes:** Since FHFA data is metro-level and zones are sub-metro, add a confidence note like "Metro-level agency data mapped to zone; sub-zone granularity not available."
11. Run linters and type checks
12. Stage only changed files (never `git add -A`)
13. Commit with message referencing the MSA feature card:
    ```
    feat(msa): Agency Lending Volume Tracker — Fannie/Freddie by MSA Zone

    Feature Card: fc2c19c4-8c8f-46fb-8766-0b6969e69261
    Lineage: Miami-Wynwood brief 2026-03-24, capital_availability null fix

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
14. Push with conflict handling: `git pull --rebase origin main && git push origin main`
15. Update the feature card status in Supabase to `built`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by running the test case (Miami MSA 2025 should return agency_loan_count > 0)
- Update the card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-27.md`
- Note whether this feature would have improved the Miami-Wynwood research brief that surfaced it (specifically: would capital_availability.agency_volume_delta now be non-null?)
