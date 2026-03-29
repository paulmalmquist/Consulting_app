# Meta Prompt — MSA Zone Interactive Polygon Map

> **Supersedes:** 4068f9fe-zone-intelligence-dashboard.md (absorbs its scope and extends it)
> **Priority:** 90/100 (Paul directly requested this)
> **Category:** visualization + data seeding
> **Target Module:** portfolio_dashboard / msa lab environment
> **Date:** 2026-03-29

---

## What We're Building

An interactive Leaflet polygon map as the primary surface for the MSA Rotation Engine. All 14 zones rendered as colored polygons on a dark basemap, with click-to-expand intelligence briefs, tier-based coloring, rotation status indicators, and live data from Supabase.

This is not a table with a map sidebar. The map IS the page. Think Bloomberg Terminal meets Google Maps for submarket acquisition intelligence.

## Pre-Build: Seed Zone Polygons (CRITICAL)

**All 14 `zone_polygon` values in `msa_zone` are currently NULL.** The map cannot render without geometry. The first task is seeding approximate neighborhood-level polygons for each zone.

### Polygon Seeding Strategy

Use approximate bounding polygons for each submarket neighborhood. These don't need to be parcel-precise — they need to be recognizable on a map as "that neighborhood." Use publicly available neighborhood boundary approximations.

Run this SQL to seed all 14 zones. Coordinates are approximate neighborhood boundaries (WGS84, SRID 4326):

```sql
-- Tier 1: Active Deal Flow
UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-80.0555 26.7145, -80.0555 26.7225, -80.0475 26.7225, -80.0475 26.7145, -80.0555 26.7145))', 4326)
WHERE zone_slug = 'wpb-downtown';

UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-80.1965 25.8050, -80.1965 25.8180, -80.1870 25.8180, -80.1870 25.8050, -80.1965 25.8050))', 4326)
WHERE zone_slug = 'miami-wynwood';

UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-80.1480 26.1230, -80.1480 26.1330, -80.1380 26.1330, -80.1380 26.1230, -80.1480 26.1230))', 4326)
WHERE zone_slug = 'ftl-flagler';

UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-82.4620 27.9420, -82.4620 27.9530, -82.4490 27.9530, -82.4490 27.9420, -82.4620 27.9420))', 4326)
WHERE zone_slug = 'tampa-water-st';

UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-81.3850 28.5380, -81.3850 28.5480, -81.3750 28.5480, -81.3750 28.5380, -81.3850 28.5380))', 4326)
WHERE zone_slug = 'orlando-creative';

-- Tier 2: Opportunistic
UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-81.6650 30.3230, -81.6650 30.3330, -81.6550 30.3330, -81.6550 30.3230, -81.6650 30.3230))', 4326)
WHERE zone_slug = 'jax-brooklyn';

UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-86.7870 36.1470, -86.7870 36.1570, -86.7770 36.1570, -86.7770 36.1470, -86.7870 36.1470))', 4326)
WHERE zone_slug = 'nash-weho';

UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-80.8620 35.2120, -80.8620 35.2220, -80.8520 35.2220, -80.8520 35.2120, -80.8620 35.2120))', 4326)
WHERE zone_slug = 'clt-south-end';

UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-78.6440 35.7700, -78.6440 35.7800, -78.6340 35.7800, -78.6340 35.7700, -78.6440 35.7700))', 4326)
WHERE zone_slug = 'raleigh-dts';

UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-97.7250 30.2470, -97.7250 30.2580, -97.7140 30.2580, -97.7140 30.2470, -97.7250 30.2470))', 4326)
WHERE zone_slug = 'austin-east-riv';

-- Tier 3: Macro Bellwethers
UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-111.9420 33.4180, -111.9420 33.4310, -111.9280 33.4310, -111.9280 33.4180, -111.9420 33.4180))', 4326)
WHERE zone_slug = 'phx-tempe';

UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-96.7870 32.7790, -96.7870 32.7890, -96.7770 32.7890, -96.7770 32.7790, -96.7870 32.7790))', 4326)
WHERE zone_slug = 'dal-deep-ellum';

UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-104.9850 39.7600, -104.9850 39.7710, -104.9730 39.7710, -104.9730 39.7600, -104.9850 39.7600))', 4326)
WHERE zone_slug = 'den-rino';

UPDATE msa_zone SET zone_polygon = ST_GeomFromText('POLYGON((-84.4130 33.7620, -84.4130 33.7720, -84.4000 33.7720, -84.4000 33.7620, -84.4130 33.7620))', 4326)
WHERE zone_slug = 'atl-westside';
```

**After seeding, verify:** `SELECT zone_slug, ST_AsGeoJSON(zone_polygon)::text FROM msa_zone WHERE zone_polygon IS NOT NULL;` should return 14 rows.

**IMPORTANT:** These are rectangular approximations. A follow-up task should refine them with actual neighborhood boundary GeoJSON from OpenStreetMap or city open data portals. But rectangles are enough to ship v1.

## Backend: API Endpoints

### New FastAPI routes in `backend/app/routes/msa_intel.py`:

```
GET /api/v1/msa/zones
  → Returns all active zones with GeoJSON polygons, tier, scores, last_rotated_at, latest brief summary
  → Response: { zones: MsaZoneGeoResponse[] }

GET /api/v1/msa/zones/{zone_slug}/brief
  → Returns the latest intel brief for a zone
  → Response: MsaZoneBriefResponse (signals, findings, composite_score, brief_date)

GET /api/v1/msa/zones/{zone_slug}/history
  → Returns last N briefs for trend sparklines
  → Response: { briefs: MsaZoneBriefResponse[] }

GET /api/v1/msa/feature-cards
  → Returns open feature cards with filters
  → Query params: ?status=prompted&category=data_source
  → Response: { cards: MsaFeatureCardResponse[] }
```

### Response shape for zones endpoint:
```typescript
interface MsaZoneGeoResponse {
  msa_zone_id: string;
  zone_slug: string;
  zone_name: string;
  tier: 1 | 2 | 3;
  asset_class_focus: string;
  rotation_cadence_days: number;
  last_rotated_at: string | null;
  rotation_priority_score: number;
  geojson: GeoJSON.Polygon;  // from ST_AsGeoJSON(zone_polygon)
  latest_brief?: {
    composite_score: number;
    brief_date: string;
    top_finding: string;
  };
}
```

## Frontend: Interactive Map Page

### Route: `repo-b/src/app/lab/env/[envId]/msa/page.tsx`

### Map Behavior

1. **Initial view:** Fit bounds to all 14 zone polygons. US Southeast/Sun Belt overview.

2. **Polygon styling by tier:**
   - Tier 1 (Active Deal Flow): Green fill, 0.35 opacity, white border
   - Tier 2 (Opportunistic): Blue fill, 0.25 opacity, white border
   - Tier 3 (Macro Bellwether): Purple fill, 0.15 opacity, white border

3. **Polygon styling by rotation freshness:**
   - Rotated today: Pulsing border animation (CSS keyframe)
   - Rotated within cadence: Normal border
   - Overdue: Red dashed border

4. **Hover state:** Brighten polygon fill to 0.6 opacity, show tooltip with:
   - Zone name
   - Tier badge
   - Days since last rotation
   - Composite score (if brief exists) or "No intel yet"

5. **Click → Side panel slides in** from right (40% width on desktop, full screen on mobile):
   - Zone header: name, tier badge, asset class pill, rotation cadence
   - "Today's Active Zone" banner if this zone is today's rotation target
   - Latest brief summary (or empty state: "Research sweep hasn't run for this zone yet")
   - Signal gauges: transaction_activity, supply_pipeline, demand_drivers, rent_occupancy, capital_markets, regulatory (6 categories from the research protocol)
   - Mini sparkline of composite_score over last N briefs
   - "Feature Gaps Found" count linking to filtered backlog

6. **Legend panel** (top-right corner, collapsible):
   - Tier color key
   - Rotation status indicators
   - "Today: {zone_name}" callout

7. **Bottom bar** (optional, collapsible):
   - Feature card backlog table with gap_category filter pills
   - Priority sort
   - Status badges (identified → specced → prompted → built → verified)

### Components to Create

```
repo-b/src/components/msa/
  MsaPolygonMap.tsx          ← Main Leaflet map with GeoJSON polygon layer
  MsaZoneTooltip.tsx         ← Hover tooltip
  MsaZoneSidePanel.tsx       ← Click-to-expand intel panel
  MsaBriefSummary.tsx        ← Brief display within side panel
  MsaSignalGauge.tsx         ← Individual signal category gauge (0-100)
  MsaRotationBadge.tsx       ← "Active Today" / "3 days ago" / "Overdue" badge
  MsaTierBadge.tsx           ← Tier 1/2/3 colored badge
  MsaFeatureBacklog.tsx      ← Bottom bar feature card table
  MsaMapLegend.tsx           ← Collapsible legend overlay
```

### Reference Components (read before building):
```
repo-b/src/components/repe/pipeline/geo/DealGeoMap.tsx  ← Primary map pattern (Leaflet + GeoJSON + dark CARTO tiles)
repo-b/src/components/repe/pipeline/ChoroplethMap.tsx   ← Choropleth fill pattern
repo-b/src/components/repe/pipeline/geo/types.ts        ← Geo type definitions
repo-b/src/app/lab/env/[envId]/re/pipeline/map/page.tsx ← Full map page pattern
```

### Design Tokens
- Dark CARTO basemap (already used in DealGeoMap): `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
- Color palette: Use the existing `COLOR_SCALES` from DealGeoMap (green_sequential for Tier 1, blue_sequential for Tier 2, purple_sequential for Tier 3)
- Font: system UI stack (already in repo)
- Panel background: `#1a1a2e` with `rgba(255,255,255,0.05)` card backgrounds

## Implementation Order

1. **Seed polygons** in Supabase (SQL above)
2. **Create backend routes** (`backend/app/routes/msa_intel.py`) with Supabase queries
3. **Register routes** in FastAPI app
4. **Build `MsaPolygonMap.tsx`** — get polygons rendering on dark basemap with tier coloring
5. **Build hover tooltip** and click handler
6. **Build side panel** with brief display and signal gauges
7. **Build the page** at `repo-b/src/app/lab/env/[envId]/msa/page.tsx`
8. **Add `msa_intelligence` environment type** to constants.ts
9. **Wire up empty states** — most zones have no briefs yet, this must look intentional not broken
10. **Add rotation badge** — highlight today's active zone
11. **TypeScript + lint check**
12. **Commit and push**
13. **Update feature card status** in Supabase

## Empty State UX (Critical)

Only 5 of 14 zones have ever been rotated. Zero zones have intel briefs with actual research data populated in the `msa_zone_intel_brief` table yet (briefs exist as local JSON files in `docs/msa-intel/` but may not be in Supabase). The map must:

- Render all 14 polygons regardless of brief status
- Show "Awaiting first research sweep" for zones with no brief
- Use a muted/desaturated polygon fill for zones with no data
- Make it clear the system is live and rotating — show the rotation schedule and "next up" predictions

## Test Cases

1. Load map — all 14 polygons visible, colored by tier
2. Hover zone — tooltip appears with correct zone name and tier
3. Click zone — side panel opens with brief or empty state
4. Click zone with brief data — signal gauges render with scores
5. Today's active zone (nash-weho as of 2026-03-29) has pulsing border
6. Overdue zones show red dashed border
7. Mobile viewport — side panel goes full screen on click
8. Resize window — map reflows, polygons stay positioned

## Commit Message

```
feat(msa): Interactive polygon map for MSA zone intelligence

Adds full-screen Leaflet map rendering all 14 MSA watchlist zones as
interactive polygons with tier-based coloring, rotation status indicators,
and click-to-expand intelligence briefs. Seeds zone_polygon geometries
for all zones. New API routes for zone geo data and brief retrieval.

Supersedes feature card 4068f9fe (Zone Intelligence Dashboard).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

## Post-Build

- Update card `4068f9fe` status to `built` in Supabase
- Write session report to `docs/ops-reports/coding-sessions/`
- File a follow-up card: "Refine MSA zone polygons with actual neighborhood boundaries from OSM/city open data"
- File a follow-up card: "Add Supabase Realtime subscription for live brief updates on the polygon map"
