import { describe, expect, it } from "vitest";

import { EVENTS, eventYearStats } from "./data";

const byId = (id: string) => EVENTS.find((e) => e.id === id)!;

// The tooltip's launch-attempt + commercial/government rows read from this helper. It joins an event to
// its calendar year (Math.floor of the fractional year) and fails closed where cadence data is absent —
// it must never fabricate a share or attempt count.
describe("eventYearStats", () => {
  it("returns attempts + true commercial/government shares for years with cadence data", () => {
    expect(eventYearStats(byId("sputnik"))).toEqual({ year: 1957, attempts: 3, commercialPct: 0, governmentPct: 100 });
    expect(eventYearStats(byId("fleetscale"))).toEqual({ year: 2025, attempts: 330, commercialPct: 70, governmentPct: 30 });
    const f9 = eventYearStats(byId("falcon9"));
    expect(f9?.year).toBe(2010);                       // 2010.42 -> 2010 (floor, not round)
    expect(f9?.attempts).toBe(74);
    expect((f9?.commercialPct ?? 0) + (f9?.governmentPct ?? 0)).toBe(100);
  });

  it("fails closed (null) for years without cadence data — never fabricates", () => {
    expect(eventYearStats(byId("terranR"))).toBeNull(); // 2026.75 -> 2026 (attempts null)
    expect(eventYearStats(byId("artemis"))).toBeNull(); // 2028.4  -> 2028 (no row)
  });
});
