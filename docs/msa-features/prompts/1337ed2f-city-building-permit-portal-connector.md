# Meta Prompt Template — MSA Feature Card → Build Directive

---

You are building a Winston feature identified by the MSA Rotation Engine during research sweeps of **Miami-Wynwood** (2026-03-24) and **Tampa Water Street** (2026-03-26).

## Feature: City Building Permit Portal Connector — YTD Permits by Zone

**Category:** data_source
**Priority:** 35.00/100
**Target Module:** MSA Intelligence — Data Collectors
**Lineage:** First identified: Miami-Wynwood brief 2026-03-24. Supply risk signal had null permits_ytd. Cross-zone bump from tampa-water-st 2026-03-26. Affects virtually all urban zones — city permit portals are rarely machine-readable without direct API integration. Cross-zone frequency 8/10.

## Why This Exists

During Phase 1 research sweeps, the supply_risk signal's `permits_ytd` field was null because Winston has no connector to city/county building permit portals. City of Miami permit portal requires direct API or scraping — not accessible via web search. This data gap leaves the supply risk assessment incomplete for every urban zone. Per CAPABILITY_INVENTORY.md, Winston has MSA data collectors (`msa_data_collectors.py`) but no permit portal integration. This is a net-new data source connector.

## Specification

**Inputs:**
- city or county name
- zip_codes array for zone
- permit_types: new_construction, renovation, demolition
- ytd_start_date

**Outputs:**
- permit_count by type
- valuation_total (aggregate dollar value of permits)
- unit_count (residential units permitted)
- data_source and freshness (which portal, when last updated)

**Acceptance Criteria:**
1. Returns permit data for Miami from Miami-Dade Socrata or OpenPermits.io within 30 seconds
2. Supports at least 8 major city portals (Miami, NYC, Chicago, Dallas, Atlanta, Denver, Phoenix, Seattle)
3. Maps permit types to standardized schema regardless of source portal taxonomy
4. Feeds permits_ytd in supply_risk signal in zone brief

**Test Cases:**
1. Miami (zips: 33127, 33132) — should return permit_count > 0 for 2026 YTD from Socrata/OpenPermits
2. Chicago (zip: 60610) — should return permit_count > 0 from Chicago data portal
3. Unknown city with no portal — should return null with "no_portal_available" status, not error

## Schema Impact

Add `permits_ytd` JSONB column to zone_brief supply_risk signal. No new tables needed. The JSONB structure:

```json
{
  "permits_ytd": {
    "new_construction": {"count": 42, "valuation": 156000000, "units": 380},
    "renovation": {"count": 128, "valuation": 45000000},
    "demolition": {"count": 8, "valuation": 2100000},
    "data_source": "miami-dade-socrata",
    "data_freshness": "2026-03-15",
    "coverage": "full"
  }
}
```

## Files to Touch

- `backend/app/services/msa_data_collectors.py` — Add new `permit_portal_connector()` function with portal registry
- `backend/app/services/msa_research_sweep.py` — Integrate permit pull into the sweep pipeline (call permit_portal_connector during supply_risk assembly)
- `backend/app/services/msa_data_collectors.py` — Add portal registry dict mapping city names to Socrata endpoints and API patterns

### Portal Registry (starter set)

| City | Portal Type | Endpoint Pattern |
|---|---|---|
| Miami | Socrata (Miami-Dade) | `data.miamidade.gov/resource/{dataset_id}.json` |
| NYC | NYC Open Data (Socrata) | `data.cityofnewyork.us/resource/{dataset_id}.json` |
| Chicago | Chicago Data Portal (Socrata) | `data.cityofchicago.org/resource/{dataset_id}.json` |
| Dallas | Dallas Open Data | `www.dallasopendata.com/resource/{dataset_id}.json` |
| Atlanta | Atlanta Open Data | Check availability |
| Denver | Denver Open Data (Socrata) | `data.denvergov.org/resource/{dataset_id}.json` |
| Phoenix | Phoenix Open Data | Check availability |
| Seattle | Seattle Open Data (Socrata) | `data.seattle.gov/resource/{dataset_id}.json` |

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
3. Read `docs/LATEST.md` for current production status
4. Read `backend/app/services/msa_data_collectors.py` to understand existing collector patterns
5. Read `backend/app/services/msa_research_sweep.py` to understand where permit data should feed in
6. Implement the portal registry as a dict of city configs with Socrata endpoint templates
7. Build `permit_portal_connector()` with async HTTP calls to Socrata APIs, filtering by zip code and date range
8. Add permit type normalization (each portal uses different category names — map to standard taxonomy)
9. Integrate into sweep pipeline so supply_risk signal automatically includes permit data
10. Handle failures gracefully: if a portal is down or doesn't exist for a city, return null with status indicator
11. Run linters and type checks
12. Stage only changed files (never `git add -A`)
13. Commit with message referencing the MSA feature card:
    ```
    feat(msa): City Building Permit Portal Connector — YTD Permits by Zone

    Feature Card: 1337ed2f-8d56-405c-9af0-676e503891d3
    Lineage: miami-wynwood 2026-03-24 + tampa-water-st 2026-03-26 — permits_ytd was null in supply risk

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
14. Push with conflict handling: `git pull --rebase origin main && git push origin main`
15. Update the feature card status in Supabase to `built`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by running at least one test case (Miami permits return > 0)
- Update the card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-26.md`
- Note whether this feature would have improved the Miami-Wynwood and Tampa Water Street briefs that surfaced it
