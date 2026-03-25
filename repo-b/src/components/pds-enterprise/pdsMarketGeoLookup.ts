/**
 * Static geocoding lookup for PDS market names.
 * Maps market_code or market_name patterns to approximate US lat/lng centroids.
 */

const GEO_ENTRIES: Array<{ patterns: string[]; lat: number; lng: number }> = [
  { patterns: ["northeast", "new england", "boston", "connecticut"], lat: 42.0, lng: -72.5 },
  { patterns: ["mid-atlantic", "mid atlantic", "philadelphia", "new jersey", "washington dc"], lat: 39.2, lng: -76.0 },
  { patterns: ["new york", "nyc", "manhattan"], lat: 40.7, lng: -74.0 },
  { patterns: ["south florida", "miami", "fort lauderdale"], lat: 26.1, lng: -80.3 },
  { patterns: ["north florida", "jacksonville", "tampa", "orlando"], lat: 28.5, lng: -81.5 },
  { patterns: ["southeast", "atlanta", "georgia", "carolina"], lat: 33.8, lng: -84.3 },
  { patterns: ["midwest", "chicago", "illinois", "indiana"], lat: 41.8, lng: -87.6 },
  { patterns: ["ohio", "cleveland", "columbus", "cincinnati"], lat: 40.0, lng: -82.5 },
  { patterns: ["texas", "dallas", "houston", "austin", "san antonio"], lat: 31.0, lng: -97.0 },
  { patterns: ["mountain", "denver", "colorado", "utah", "salt lake"], lat: 39.7, lng: -105.0 },
  { patterns: ["pacific northwest", "seattle", "portland", "oregon", "washington"], lat: 47.6, lng: -122.3 },
  { patterns: ["california", "los angeles", "san francisco", "san diego"], lat: 36.7, lng: -119.8 },
  { patterns: ["southern california", "socal", "la"], lat: 34.0, lng: -118.2 },
  { patterns: ["northern california", "norcal", "bay area"], lat: 37.8, lng: -122.4 },
  { patterns: ["arizona", "phoenix", "tucson"], lat: 33.4, lng: -112.0 },
  { patterns: ["tennessee", "nashville", "memphis", "knoxville"], lat: 35.5, lng: -86.8 },
  { patterns: ["virginia", "richmond", "norfolk"], lat: 37.5, lng: -77.4 },
  { patterns: ["gulf coast", "new orleans", "louisiana", "alabama"], lat: 30.0, lng: -90.0 },
  { patterns: ["heartland", "kansas", "missouri", "st louis"], lat: 38.6, lng: -94.5 },
  { patterns: ["great lakes", "michigan", "detroit", "minnesota", "minneapolis"], lat: 44.0, lng: -85.5 },
  { patterns: ["public sector"], lat: 38.9, lng: -77.0 },
  { patterns: ["healthcare"], lat: 39.8, lng: -86.2 },
  { patterns: ["federal"], lat: 38.9, lng: -77.0 },
];

const US_CENTER = { lat: 39.8, lng: -98.5 };

export function lookupMarketGeo(
  marketName: string,
  marketCode?: string,
): { lat: number; lng: number } {
  const nameLC = marketName.toLowerCase();
  const codeLC = (marketCode ?? "").toLowerCase().replace(/_/g, " ");

  for (const entry of GEO_ENTRIES) {
    for (const pattern of entry.patterns) {
      if (nameLC.includes(pattern) || codeLC.includes(pattern)) {
        return { lat: entry.lat, lng: entry.lng };
      }
    }
  }

  // Deterministic jitter from name hash so unmatched markets don't stack
  let hash = 0;
  for (let i = 0; i < marketName.length; i++) {
    hash = ((hash << 5) - hash + marketName.charCodeAt(i)) | 0;
  }
  const jitterLat = ((hash % 100) / 100) * 6 - 3;
  const jitterLng = (((hash >> 8) % 100) / 100) * 10 - 5;

  return {
    lat: US_CENTER.lat + jitterLat,
    lng: US_CENTER.lng + jitterLng,
  };
}
