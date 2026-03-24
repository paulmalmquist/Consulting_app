# Meta Prompt — BLS QCEW + FRED Employment Series Auto-Pull for MSA Zones

> **Card ID:** 934432de-5eb1-406c-b3e9-a94b45b802bf
> **Status:** prompted (as of 2026-03-23)
> **Priority:** 48/100
> **Category:** data_source
> **Target Module:** data_connectors

---

You are building a Winston feature identified by the MSA Rotation Engine during a 2026-03-22 cold-start audit of the MSA research protocol (`skills/msa-rotation-engine/config/source_registry.json`).

## Feature: BLS QCEW + FRED Employment Series Auto-Pull for MSA Zones

**Category:** data_source
**Priority:** 48/100
**Target Module:** data_connectors
**Lineage:** Identified during 2026-03-22 cold-start audit of MSA research protocol. BLS QCEW and FRED are listed as primary demand-driver sources in source_registry.json Category 3 (Demand Drivers) with `type: "web_fetch"` entries that are not yet backed by a real connector. Maximum cross-zone frequency — all 14 watchlist zones need employment data. Per CAPABILITY_INVENTORY.md, Winston has no existing BLS or FRED connector.

## Why This Exists

During the Phase 1 research sweep, the engine needs employment trend data for each MSA zone's acquisition score calculation. The `source_registry.json` already specifies BLS QCEW (`https://data.bls.gov/timeseries/ENU{fips_code}5{industry_code}`) and FRED (`https://fred.stlouisfed.org/series/{msa_employment_series}`) as the canonical sources. Without a real connector, these fall back to unstructured web search, which produces unreliable numeric outputs. This connector closes that gap. It is independent of the sweep runner and can be built in parallel.

## Specification

**Inputs:**
- `county_fips` — list of county FIPS codes for the zone (e.g. Palm Beach = `["12099"]`, Miami-Dade = `["12086"]`)
- `industry_code` — BLS industry code (optional; default `"05"` = all private sector)
- `fred_series_id` — FRED series ID (e.g. `"MIAMTOT"` for Miami total employment, `"ORLANDOT"` for Orlando)
- `date_range` — dict with `start` and `end` in `YYYY-MM` format (default: last 24 months)

**Outputs:**
- `monthly_series` — list of `{date: "YYYY-MM", level: int, yoy_change_pct: float}` objects
- `demand_momentum` — dict: `{direction: "growing"|"flat"|"declining", yoy_change_pct: float, source: "bls"|"fred"|"web_fallback"}`
- `top_employers` — list of 3-5 employer moves/expansions from web search fallback (string list)
- Raw source metadata: `{source_url, retrieved_at, series_id}`

**Acceptance Criteria:**
- BLS API call succeeds for all 14 county FIPS codes in the watchlist (see FIPS list below)
- FRED fallback works when BLS returns no data or rate-limits
- Employment data cached in `msa_zone_intel_brief.signals` JSONB under `demand_drivers.employment` key
- API rate limiting handled gracefully (BLS v2 = 500 req/day without key, 3000 with key; FRED = 120 req/min)
- Web search fallback triggered when both BLS and FRED return empty series
- `source_registry.json` entry for BLS/FRED updated from `type: "web_fetch"` to `type: "connector"` with `connector: "bls_fred_connector"`

**Test Cases:**
- Fetch Palm Beach County (FIPS `12099`) employment series Jan 2024 – Mar 2026, verify non-empty result
- Fetch Miami-Dade via FRED series `MIAMTOT`, verify `yoy_change_pct` is computed as float
- Verify graceful empty-result handling: pass a fictional FIPS `00000`, expect `demand_momentum.source = "web_fallback"` and no exception
- Verify BLS rate-limit handling: mock a 429 response, expect retry logic with exponential backoff (max 3 retries)

## 14-Zone FIPS Reference

```python
ZONE_FIPS = {
    "wpb-downtown":       ["12099"],   # Palm Beach County, FL
    "miami-brickell":     ["12086"],   # Miami-Dade County, FL
    "nashville-east":     ["47037"],   # Davidson County, TN
    "charlotte-south":    ["37119"],   # Mecklenburg County, NC
    "austin-domain":      ["48453"],   # Travis County, TX
    "denver-rino":        ["08031"],   # Denver County, CO
    "atlanta-midtown":    ["13121"],   # Fulton County, GA
    "orlando-lake-nona":  ["12095"],   # Orange County, FL
    "raleigh-nc":         ["37183"],   # Wake County, NC
    "dallas-uptown":      ["48113"],   # Dallas County, TX
    "houston-galleria":   ["48201"],   # Harris County, TX
    "phoenix-scottsdale": ["04013"],   # Maricopa County, AZ
    "jacksonville-brook": ["12031"],   # Duval County, FL
    "tampa-channelside":  ["12057"],   # Hillsborough County, FL
}
```

## Schema Impact

No new tables. Write employment data to:
```sql
-- Update msa_zone_intel_brief.signals JSONB
UPDATE msa_zone_intel_brief
SET signals = signals || jsonb_build_object(
    'demand_drivers', signals->'demand_drivers' || jsonb_build_object(
        'employment', '{employment_payload}'::jsonb
    )
)
WHERE zone_id = '{zone_id}' AND brief_date = (
    SELECT MAX(brief_date) FROM msa_zone_intel_brief WHERE zone_id = '{zone_id}'
);
```

The `signals` column in `msa_zone_intel_brief` is already JSONB. Verify the exact column structure before writing:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'msa_zone_intel_brief' ORDER BY ordinal_position;
```

## Files to Touch

### New files (create):
```
backend/app/services/bls_fred_connector.py        ← main connector service
backend/tests/test_bls_fred_connector.py          ← unit tests (mock HTTP)
```

### Existing files to modify:
```
backend/app/mcp/tools/repe_analysis_tools.py      ← add employment_data MCP tool
skills/msa-rotation-engine/config/source_registry.json ← update BLS/FRED entries from web_fetch to connector
```

### Reference patterns to read before coding:
```
backend/app/services/re_sustainability_connectors.py  ← existing connector pattern (mock-based)
backend/app/services/market_regime_engine.py          ← data pipeline service pattern
backend/app/mcp/tools/repe_analysis_tools.py          ← existing repe_analysis tools pattern
```

## BLS API Details

The BLS Public Data API v2 is free. No API key required for basic access (500 req/day).

**Endpoint:** `https://api.bls.gov/publicAPI/v2/timeseries/data/`

**Request format:**
```python
import httpx

async def fetch_bls_series(series_id: str, start_year: str, end_year: str) -> dict:
    """
    series_id format for QCEW: ENU{fips}5{industry_code}
    e.g. ENU12099505 = Palm Beach, all private sector, quarterly employment
    """
    payload = {
        "seriesid": [series_id],
        "startyear": start_year,
        "endyear": end_year,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.bls.gov/publicAPI/v2/timeseries/data/",
            json=payload
        )
        resp.raise_for_status()
        return resp.json()
```

**Response shape:** `data.Results.series[0].data` — list of `{year, period, value, footnotes}`

## FRED API Details

FRED API is free. Key is optional for low-volume use but recommended.

**Endpoint:** `https://api.stlouisfed.org/fred/series/observations`

**Request format:**
```python
async def fetch_fred_series(series_id: str, start_date: str, end_date: str, api_key: str = "") -> dict:
    params = {
        "series_id": series_id,
        "observation_start": start_date,  # YYYY-MM-DD
        "observation_end": end_date,
        "file_type": "json",
    }
    if api_key:
        params["api_key"] = api_key
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params=params
        )
        resp.raise_for_status()
        return resp.json()
```

**Response shape:** `observations` — list of `{date, value}` where value may be `"."` for missing data.

## FRED Series IDs for All 14 Zones

```python
ZONE_FRED_SERIES = {
    "wpb-downtown":       "WTPALMSA",    # West Palm Beach-Boca Raton MSA employment
    "miami-brickell":     "MIAMTOT",     # Miami total employment
    "nashville-east":     "NASHVTOT",    # Nashville total employment
    "charlotte-south":    "CHARLTOT",    # Charlotte total employment
    "austin-domain":      "AUSTNTOT",    # Austin total employment
    "denver-rino":        "DENVTOT",     # Denver total employment
    "atlanta-midtown":    "ATLATOT",     # Atlanta total employment
    "orlando-lake-nona":  "ORLANDOT",    # Orlando total employment
    "raleigh-nc":         "RALEIGHTOT",  # Raleigh total employment
    "dallas-uptown":      "DALLAWTOT",   # Dallas-Worth total employment
    "houston-galleria":   "HOUTOT",      # Houston total employment
    "phoenix-scottsdale": "PHOXTOT",     # Phoenix total employment
    "jacksonville-brook": "JAXVLTOT",    # Jacksonville total employment
    "tampa-channelside":  "TAMPTOT",     # Tampa total employment
}
```

Note: FRED series IDs above are best-effort matches. Verify each against FRED before committing. If a series ID does not resolve, fall back to the next best available series or web search fallback.

## MCP Tool Specification

Add to `backend/app/mcp/tools/repe_analysis_tools.py`:

```python
# Tool name: get_msa_employment_data
# Category: repe_market (new, or add to repe_analysis)
# Description: Fetch BLS QCEW or FRED employment series for a given MSA zone
# Parameters:
#   zone_id: str — MSA zone slug (e.g. "wpb-downtown")
#   months_back: int — number of months of history (default 24)
# Returns: demand_momentum dict + monthly_series array
```

## Implementation Instructions

1. Read `CLAUDE.md` — this is a backend data connector → route through `agents/bos-domain.md` and `.skills/feature-dev/SKILL.md`
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm no BLS/FRED connector exists (none as of 2026-03-22)
3. Read `docs/LATEST.md` — MSA pipeline is BLOCKED; this connector is an independent unblocking step
4. Read `backend/app/services/re_sustainability_connectors.py` for the connector service pattern
5. Create `backend/app/services/bls_fred_connector.py` with:
   - `async def fetch_bls_employment(zone_id, fips_list, industry_code, date_range) -> dict`
   - `async def fetch_fred_employment(zone_id, series_id, date_range) -> dict`
   - `async def get_zone_employment_data(zone_id, months_back=24) -> dict` — orchestrator: tries BLS first, FRED fallback, web_search fallback
   - `def compute_demand_momentum(monthly_series) -> dict` — computes direction and yoy_change_pct
6. Add `httpx` as an async HTTP client (already in repo; verify with `grep -r "httpx" backend/requirements*.txt`)
7. Add the `get_msa_employment_data` MCP tool to `repe_analysis_tools.py`
8. Update `source_registry.json` BLS/FRED entries: change `type` from `"web_fetch"` to `"connector"`, add `"connector": "bls_fred_connector"`
9. Write `backend/tests/test_bls_fred_connector.py` — mock `httpx.AsyncClient` to avoid real API calls in CI
10. Run `pytest backend/tests/test_bls_fred_connector.py -v` — all tests must pass
11. Run `ruff check backend/app/services/bls_fred_connector.py` — no linting errors
12. Stage only changed files (never `git add -A`)
13. Commit with:
    ```
    feat(msa): BLS QCEW + FRED employment series connector for MSA zones

    Feature Card: 934432de-5eb1-406c-b3e9-a94b45b802bf
    Lineage: Cold-start audit 2026-03-22. source_registry.json listed BLS/FRED as
    web_fetch sources with no backing connector. Adds bls_fred_connector.py with
    async BLS QCEW + FRED fetch, demand_momentum computation, and graceful fallback
    to web search when both APIs return empty. Covers all 14 watchlist zones.

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
14. `git pull --rebase origin main && git push origin main`
15. Update feature card status in Supabase: `UPDATE msa_feature_card SET status = 'built', updated_at = now() WHERE card_id = '934432de-5eb1-406c-b3e9-a94b45b802bf';`

## Proof of Execution

After building, the coding agent must:
- Run `pytest backend/tests/test_bls_fred_connector.py -v` and confirm all pass
- Optionally make one live BLS API call (Palm Beach FIPS 12099) to confirm the endpoint works
- Update the card status from `prompted` to `built` in Supabase
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-23.md` (append if file exists)
- Note: the connector's output feeds directly into `msa_zone_intel_brief.signals` JSONB — verify the write path works with a test brief insert if possible

## Build Independence Note

This connector is **independent of the Zone Intelligence Dashboard (card 4068f9fe) and the MSA Research Sweep Runner (card b1620471)**. It can be built in any order. However, once both the sweep runner and this connector exist, the sweep runner should call `get_zone_employment_data()` during Phase 1 research to populate demand_drivers in each new brief. The sweep runner's service file should be checked for any employment data fetch calls after this connector is built.
