# Meta Prompt — County Assessor / Recorder Live Data Connector

**Feature Card:** e769041f-7a3c-4f27-adfc-5d4c2c8ff094
**Generated:** 2026-03-22
**Status:** prompted

---

You are building a Winston feature identified by the MSA Rotation Engine during a cold-start audit on **2026-03-22**.

## Feature: County Assessor / Recorder Live Data Connector

**Category:** data_source
**Priority:** 65/100
**Target Module:** data_connectors
**Lineage:** Identified during 2026-03-22 cold-start audit of MSA research protocol. County assessor data is Category 1 (Transaction Activity) in source_registry.json and affects all 14 watchlist zones. Without this connector, transaction activity research relies entirely on unstructured web search returning landing pages rather than transaction records.

## Why This Exists

During the Phase 1 research sweep of all 14 watchlist zones, the engine needed to pull recent deed transfers, sales comps, and lis pendens notices from county assessor and recorder offices. This capability does not currently exist in Winston — research relies entirely on web search, which returns inconsistent and incomplete results. Building it will improve research quality for all 14 zones, covering: Palm Beach, Miami-Dade, Broward, Hillsborough, Orange, Duval, Davidson, Mecklenburg, Wake, Travis, Fulton, Dallas, Denver, and Maricopa counties.

## Specification

**Inputs:**
- `county_fips` or `county_name` (string)
- `asset_class` filter: `multifamily` | `office` | `retail` | `industrial`
- `date_range`: last 90/180/365 days
- Zone bounding box or zip codes (list of strings)

**Outputs:**
- Array of deed transfer records: `grantor`, `grantee`, `sale_price`, `sale_date`, `property_address`, `APN`
- Array of lis pendens / NOD filings: `filing_date`, `borrower`, `lender`, `property_address`
- Aggregated stats: `median_sale_price`, `total_volume`, `distress_count`

**Acceptance Criteria:**
- Returns at least 10 records for `wpb-downtown` (ZIP 33401) in last 180 days
- Lis pendens data includes `filing_date` and `property_address`
- Falls back gracefully to web search with structured extraction if direct API is unavailable
- Data cached in `msa_zone_intel_brief.raw_sources` JSONB with source attribution

**Test Cases:**
1. Pull Palm Beach County deed transfers Q1 2026 for ZIP 33401 — verify ≥ 5 records returned with `sale_price` populated
2. Pull Miami-Dade lis pendens for Wynwood bounding box — verify results include `filing_date`
3. Simulate county portal rate-limiting — verify graceful fallback to web search extraction without hard crash
4. Cache result in Supabase — verify `msa_zone_intel_brief.raw_sources` JSONB contains `county_assessor` key after connector run

## Schema Impact

Two options (choose the simpler one):
1. **Preferred:** Store connector output in `msa_zone_intel_brief.raw_sources` JSONB under key `county_assessor` — no schema change needed
2. **Alternative:** Add `county_assessor_cache` table if raw source volume justifies it (large per-zone cache > 500 records)

No new tables required for the MVP. Use option 1.

## Files to Touch

**New service (primary build target):**
- `backend/app/services/county_assessor_connector.py` — main connector service
  - Class `CountyAssessorConnector` with methods:
    - `get_deed_transfers(county_fips, zip_codes, date_range_days, asset_class)` → list of deed records
    - `get_lis_pendens(county_fips, zip_codes, date_range_days)` → list of distress filings
    - `get_aggregated_stats(county_fips, zip_codes, date_range_days)` → stats dict
    - `_web_search_fallback(county_name, zip_codes, date_range_days)` → structured extraction from web search

**MCP tool (expose to AI copilot):**
- `backend/app/mcp/` — add `repe_market` MCP tool category if it doesn't exist, or append to nearest REPE market data category
  - Tool: `get_county_transaction_data` with inputs: `county_name`, `zip_codes`, `asset_class`, `days`
  - Tool: `get_county_distress_signals` with inputs: `county_name`, `zip_codes`, `days`

**Source registry update (config):**
- `skills/msa-rotation-engine/config/source_registry.json` — update `transaction_activity.sources` array
  - Change the County Assessor/Recorder entry from `"type": "web_search"` to `"type": "connector"`
  - Add `"connector": "county_assessor_connector"` field

**Reference files to read before coding:**
- `backend/app/services/extraction_engine.py` — follow existing service patterns for class structure
- `backend/app/mcp/` — read an existing MCP tool definition file for schema conventions
- `skills/msa-rotation-engine/config/source_registry.json` — understand where this connector plugs in

## County Coverage Map

The connector must cover these 14 counties (matching the 14 watchlist zones):

| Zone | County | State | Key ZIP Codes |
|---|---|---|---|
| wpb-downtown | Palm Beach | FL | 33401, 33406 |
| miami-wynwood | Miami-Dade | FL | 33127, 33137 |
| fort-lauderdale-flagler | Broward | FL | 33301, 33311 |
| tampa-water-street | Hillsborough | FL | 33602, 33606 |
| orlando-creative-village | Orange | FL | 32801, 32805 |
| jacksonville-brooklyn | Duval | FL | 32202, 32254 |
| nashville-germantown | Davidson | TN | 37201, 37208 |
| charlotte-south-end | Mecklenburg | NC | 28203, 28217 |
| raleigh-warehouse | Wake | NC | 27601, 27603 |
| austin-east | Travis | TX | 78702, 78721 |
| atlanta-beltline | Fulton | GA | 30312, 30315 |
| dallas-design | Dallas | TX | 75226, 75207 |
| denver-rino | Denver | CO | 80205, 80216 |
| phoenix-roosevelt | Maricopa | AZ | 85004, 85006 |

## Implementation Instructions

1. Read `CLAUDE.md` — route this task through `agents/bos-domain.md` (new backend service) with `agents/mcp.md` as support
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm no county assessor connector exists (as of 2026-03-20 it does not)
3. Read `docs/LATEST.md` — note current production status; no conflicts with this build
4. Read `backend/app/services/extraction_engine.py` — follow the existing class and method pattern
5. Read one existing MCP tool file in `backend/app/mcp/` — match the tool schema format
6. Build `county_assessor_connector.py` with the class structure above
7. For direct data access: use ATTOM Data API (https://api.attomdata.com) or CoreLogic if credentials exist in environment. Check `backend/app/config.py` for any existing ATTOM/CoreLogic keys.
8. If no API credentials: implement robust web search fallback using the existing web search infrastructure. Parse county assessor search results with structured prompts to extract deed record fields.
9. Add the two MCP tools to the `repe_market` category (create the category file if it doesn't exist)
10. Update `source_registry.json` to mark county assessor as `"type": "connector"`
11. Run ruff and tsc before committing
12. Stage only changed files
13. Commit with:
    ```
    feat(msa): County Assessor / Recorder Live Data Connector

    Feature Card: e769041f-7a3c-4f27-adfc-5d4c2c8ff094
    Lineage: Cold-start audit 2026-03-22 — Category 1 data gap, affects all 14 zones

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
14. Push: `git pull --rebase origin main && git push origin main`
15. Update the feature card: `UPDATE msa_feature_card SET status = 'built' WHERE card_id = 'e769041f-7a3c-4f27-adfc-5d4c2c8ff094'`

## Proof of Execution

After building, the coding agent must:
- Run test case 1: call `get_deed_transfers('Palm Beach', ['33401'], 180, 'multifamily')` — verify ≥ 5 records with `sale_price` populated
- Run test case 3: simulate unavailable portal — verify fallback runs without exception
- Verify MCP tool schema is valid JSON and follows existing tool patterns
- Update card status from `prompted` to `built`
- Write summary to `docs/ops-reports/coding-sessions/msa-2026-03-22.md` (append if file exists)
- Note: This feature would have replaced 4 web_search entries in the `transaction_activity` category with structured connector calls, producing transaction records instead of landing pages
