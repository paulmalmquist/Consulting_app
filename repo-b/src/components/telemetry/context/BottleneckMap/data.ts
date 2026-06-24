// Static narrative data for the Bottleneck Map context module. Public, widely cited values;
// approximations are marked in the methodology footer. This is narrative content, not telemetry:
// it stays in code, never in Supabase, and the module makes no network calls. All derived series
// are computed once at module scope.

import { RS } from "../../rsTokens";
import type {
  ColorByKey, CostPoint, DimensionEntry, DimensionKey, LaunchEvent, SizeModeKey, TimeWindow,
  YearPoint,
} from "./types";

// Two color dimensions for the bubbles
export const INNOVATION: Record<string, DimensionEntry> = {
  mission:       { color: RS.blue,   label: "Mission achievement" },
  cost:          { color: RS.green,  label: "Cost reduction" },
  reuse:         { color: RS.amber,  label: "Reusability" },
  manufacturing: { color: RS.violet, label: "Manufacturing" },
  dataops:       { color: RS.text,   label: "AI / data operations" },
};
export const FUNDING: Record<string, DimensionEntry> = {
  government: { color: RS.blue,   label: "Government program" },
  costplus:   { color: RS.violet, label: "Cost-plus contract" },
  fixedprice: { color: RS.green,  label: "Fixed-price commercial" },
  venture:    { color: RS.amber,  label: "Venture / internal" },
};
export const COLOR_DIMENSIONS: Record<ColorByKey, { label: string; lookup: Record<string, DimensionEntry> }> = {
  type:    { label: "Innovation type", lookup: INNOVATION },
  funding: { label: "Funding model",  lookup: FUNDING },
};

export function eventDimensionKey(e: LaunchEvent, colorBy: ColorByKey): DimensionKey {
  return colorBy === "type" ? e.type : e.funding;
}
export function eventDimension(e: LaunchEvent, colorBy: ColorByKey): DimensionEntry {
  return colorBy === "type" ? INNOVATION[e.type] : FUNDING[e.funding];
}

export const BANDS: { y: number; label: string }[] = [
  { y: 1, label: "Government proof of possibility" },
  { y: 2, label: "Operational spaceflight" },
  { y: 3, label: "Commercial launch" },
  { y: 4, label: "Reusable fleet operations" },
  { y: 5, label: "Autonomous, data-driven production" },
];

export const SIZE_MODES: { key: SizeModeKey; label: string; note: string }[] = [
  { key: "scale",   label: "Program scale",  note: "editorial weighting" },
  { key: "payload", label: "Payload to LEO", note: "vehicle capacity, t" },
];

// ---------------------------------------------------------------------------
// Global orbital launch attempts per year, 1957-2025.
// Basis: Wikipedia "<year> in spaceflight" series / GCAT (J. McDowell).
// Pre-2000 values are close approximations; 2018+ are exact totals.
// ---------------------------------------------------------------------------
export const CADENCE: [number, number][] = [
  [1957, 3], [1958, 28], [1959, 23], [1960, 39], [1961, 50], [1962, 82],
  [1963, 70], [1964, 102], [1965, 125], [1966, 132], [1967, 139], [1968, 128],
  [1969, 125], [1970, 124], [1971, 134], [1972, 113], [1973, 116], [1974, 113],
  [1975, 132], [1976, 131], [1977, 130], [1978, 128], [1979, 109], [1980, 108],
  [1981, 126], [1982, 129], [1983, 129], [1984, 129], [1985, 124], [1986, 110],
  [1987, 114], [1988, 121], [1989, 105], [1990, 121], [1991, 91], [1992, 97],
  [1993, 83], [1994, 93], [1995, 80], [1996, 77], [1997, 89], [1998, 82],
  [1999, 78], [2000, 85], [2001, 59], [2002, 65], [2003, 63], [2004, 55],
  [2005, 55], [2006, 66], [2007, 68], [2008, 69], [2009, 78], [2010, 74],
  [2011, 84], [2012, 78], [2013, 81], [2014, 92], [2015, 87], [2016, 85],
  [2017, 91], [2018, 114], [2019, 102], [2020, 114], [2021, 146], [2022, 186],
  [2023, 223], [2024, 261], [2025, 330],
];
const CADENCE_BY_YEAR: Record<number, number> = Object.fromEntries(CADENCE);

// Commercial share of orbital launch attempts, %. Anchors interpolated.
// 2022-2025 are reported values; earlier anchors are coarse estimates.
export const SHARE_ANCHORS: [number, number][] = [
  [1957, 0], [1979, 0], [1985, 5], [1990, 15], [1995, 25], [1998, 35],
  [2000, 30], [2005, 20], [2010, 25], [2014, 35], [2018, 45], [2020, 50],
  [2021, 52], [2022, 55], [2023, 65], [2024, 70], [2025, 70],
];
export function shareAt(year: number): number {
  if (year <= SHARE_ANCHORS[0][0]) return SHARE_ANCHORS[0][1];
  const last = SHARE_ANCHORS[SHARE_ANCHORS.length - 1];
  if (year >= last[0]) return last[1];
  for (let i = 0; i < SHARE_ANCHORS.length - 1; i++) {
    const [x0, v0] = SHARE_ANCHORS[i];
    const [x1, v1] = SHARE_ANCHORS[i + 1];
    if (year >= x0 && year <= x1) return v0 + ((year - x0) / (x1 - x0)) * (v1 - v0);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Cost to LEO: per-launch sticker price / LEO capacity, $/kg.
// nominal = dollars of the quote year. adj = approx 2025 dollars (CPI).
// Single consistent basis: vehicle list/marginal price, NOT program-averaged.
// TODO(P3 backlog): add a dev-cost size dimension once figures are sourced and footnoted.
// ---------------------------------------------------------------------------
export const COST_POINTS: Record<number, CostPoint> = {
  1969: { v: "Saturn V",     nominal: 1320,  adj: 11500, basis: "$185M (1969) / 140 t" },
  1988: { v: "Shuttle",      nominal: 16400, adj: 44200, basis: "$450M marginal (1988) / 27.5 t. Program-averaged is ~3x higher" },
  1997: { v: "Titan IV",     nominal: 19900, adj: 39800, basis: "$432M (1997) / 21.7 t" },
  2005: { v: "Ariane 5 ECA", nominal: 7860,  adj: 12900, basis: "$165M (2005) / 21 t" },
  2018: { v: "Falcon 9 B5",  nominal: 2720,  adj: 3450,  basis: "$62M list (2018) / 22.8 t" },
  2019: { v: "Falcon Heavy", nominal: 1520,  adj: 1900,  basis: "$97M recoverable (2018) / 63.8 t" },
  2026: { v: "Terran R",     nominal: 2340,  adj: 2340,  basis: "$55M company-stated (2022) / 23.5 t reusable. Pricing may not be current" },
};

// Merged per-year series for bars, cost lines, and funding mix.
// TODO(P2 backlog): live "next launches" ticker from Launch Library 2 with a precomputed static
// fallback JSON; the demo must never depend on the network.
export const YEAR_SERIES: YearPoint[] = [];
for (let y = 1957; y <= 2026; y++) {
  const attempts = CADENCE_BY_YEAR[y] ?? null;
  const pct = attempts != null ? shareAt(y) : null;
  YEAR_SERIES.push({
    year: y,
    attempts,
    commercialPct: pct,
    governmentPct: pct != null ? 100 - pct : null,
    costNominal: COST_POINTS[y]?.nominal ?? null,
    costAdj: COST_POINTS[y]?.adj ?? null,
    costMeta: COST_POINTS[y] ?? null,
  });
}
export const FULL_WINDOW: TimeWindow = [1957, 2026];

// ---------------------------------------------------------------------------
// Event data. Public, widely cited values; approximations marked.
// focusPanel drives the presenter-mode spotlight: "map" | "cost" | "mix".
// ---------------------------------------------------------------------------
export const EVENTS: LaunchEvent[] = [
  {
    id: "sputnik", name: "Sputnik 1", date: "1957-10-04", year: 1957.76,
    band: 1, scale: 18, payloadT: 0.5, type: "mission", funding: "government",
    outcome: "success", focusPanel: "map",
    vehicle: "R-7 / Sputnik 8K71PS (USSR)",
    era: "Proof era",
    caption: "Orbit access itself is the achievement. Telemetry is two analog channels encoded in beep duration.",
    detail: "83.6 kg satellite. Two radio transmitters at 20 and 40 MHz. Telemetry was effectively a handful of analog channels: internal temperature and pressure encoded in beep duration.",
    metrics: [["Payload", "83.6 kg"], ["Telemetry", "~2 analog channels"], ["Orbit lifetime", "92 days"], ["World launches that year", "3"]],
    bottleneckSolved: "Reaching orbit at all",
    bottleneckCreated: "Doing anything useful once there",
    dataProduct: "Doppler tracking as the first orbital data pipeline",
    rhyme: "Every platform starts with a minimum viable signal.",
  },
  {
    id: "vostok", name: "Vostok 1 (Gagarin)", date: "1961-04-12", year: 1961.28,
    band: 1, scale: 20, payloadT: 4.7, type: "mission", funding: "government",
    outcome: "success", focusPanel: "map",
    vehicle: "Vostok-K (USSR)",
    era: "Proof era",
    caption: "Human spaceflight arrives almost fully automated. The human is the backup system.",
    detail: "First human orbital flight, 108 minutes. Almost fully automated: Gagarin's manual controls were locked behind a sealed envelope code because flight surgeons did not trust human performance in microgravity.",
    metrics: [["Flight time", "108 min"], ["Control mode", "Automated, human as backup"], ["Crew", "1"], ["World launches that year", "50"]],
    bottleneckSolved: "Human survival in orbit",
    bottleneckCreated: "Real-time human safety monitoring",
    dataProduct: "Biomedical telemetry and real-time mission ops",
    rhyme: "Automation first, human override second. Familiar pattern.",
  },
  {
    id: "apollo11", name: "Apollo 11", date: "1969-07-20", year: 1969.55,
    band: 2, scale: 34, payloadT: 140, type: "mission", funding: "government",
    outcome: "success", focusPanel: "cost",
    vehicle: "Saturn V (NASA)",
    era: "Operations era",
    caption: "Integration at the scale of 400,000 people. Watch the cost panel: nominal dollars hide what Apollo really cost.",
    detail: "Peak program employment around 400,000 people. The Apollo Guidance Computer ran at 2.048 MHz with about 4 KB of RAM and roughly 145,000 lines of assembly. Saturn V marginal launch cost was about $185M in 1969 dollars, roughly $1.6B today.",
    metrics: [["Program workforce", "~400,000 people"], ["AGC software", "~145k lines of assembly"], ["AGC memory", "~4 KB RAM / 72 KB ROM"], ["Cost to LEO", "~$1,320/kg nominal, ~$11,500/kg in 2025 $"]],
    bottleneckSolved: "Systems integration at unprecedented scale",
    bottleneckCreated: "Sustainable cost. Apollo was not repeatable economics",
    dataProduct: "Telemetry lineage: thousands of parameters traced from sensor to mission control console",
    rhyme: "Apollo proved integration. It never proved unit economics.",
  },
  {
    id: "shuttle", name: "Space Shuttle STS-1", date: "1981-04-12", year: 1981.28,
    band: 2, scale: 28, payloadT: 27.5, type: "reuse", funding: "costplus",
    outcome: "partial", focusPanel: "cost",
    vehicle: "Space Shuttle Columbia (NASA)",
    era: "Operations era",
    caption: "Reuse is physically proven and economically unproven. The cost curve peaks here, not in the Apollo era.",
    detail: "First reusable orbital spacecraft. Flew 135 missions over 30 years with 2 loss-of-crew failures. Marginal cost near $450M per flight in late-80s dollars; program-averaged roughly $1.5B. Primary flight software was about 400k lines with a famously low defect rate.",
    metrics: [["Missions", "135 over 30 years"], ["Marginal cost", "~$450M/flight (1988 $)"], ["Program-averaged", "~$1.5B/flight"], ["Flight software", "~400k LOC, ~1 defect per release"]],
    bottleneckSolved: "Reuse is physically possible",
    bottleneckCreated: "Reuse without refurbishment economics is not reuse",
    dataProduct: "Mission readiness reviews: the original launch-readiness dashboard, run on paper and meetings",
    rhyme: "Reusable hardware with non-reusable operations. The ops model is the product.",
  },
  {
    id: "iss", name: "ISS assembly begins (Zarya)", date: "1998-11-20", year: 1998.89,
    band: 2, scale: 24, payloadT: 19.8, type: "mission", funding: "government",
    outcome: "success", focusPanel: "map",
    vehicle: "Proton-K (multinational)",
    era: "Operations era",
    caption: "Five agencies, 40+ assembly flights, one telemetry standard. Federated governance before the term existed.",
    detail: "Start of the largest international engineering project in history. Over 40 assembly flights across multiple vehicles and agencies. The ISS now generates terabytes of telemetry and payload data per day.",
    metrics: [["Assembly flights", "40+"], ["Partner agencies", "5"], ["Continuous crew", "Since Nov 2000"], ["World launches that year", "82"]],
    bottleneckSolved: "Multi-decade orbital operations",
    bottleneckCreated: "Logistics cost of sustaining orbit",
    dataProduct: "Cross-agency data interoperability under one telemetry standard",
    rhyme: "Federated data governance, twenty years before the term existed.",
  },
  {
    id: "falcon1", name: "Falcon 1 reaches orbit", date: "2008-09-28", year: 2008.74,
    band: 3, scale: 16, payloadT: 0.67, type: "cost", funding: "venture",
    outcome: "success", focusPanel: "map",
    vehicle: "Falcon 1 Flight 4 (SpaceX)",
    era: "Commercial era",
    caption: "Private orbit access on attempt four, on venture money. The three failures were the dataset.",
    detail: "First privately developed liquid-fueled rocket to reach orbit, on the fourth attempt after three failures. The company was weeks from insolvency. Total development cost of roughly $90M to $100M, a fraction of comparable government programs.",
    metrics: [["Attempts to orbit", "4"], ["Development cost", "~$90M to $100M"], ["Payload to LEO", "~670 kg"], ["World launches that year", "69"]],
    bottleneckSolved: "Private access to orbit",
    bottleneckCreated: "Scaling from proof to product",
    dataProduct: "Failure investigation as the core engineering loop: flights 1 to 3 were the dataset",
    rhyme: "Three labeled failures were worth more than one lucky success.",
  },
  {
    id: "falcon9", name: "Falcon 9 first flight", date: "2010-06-04", year: 2010.42,
    band: 3, scale: 24, payloadT: 22.8, type: "cost", funding: "fixedprice",
    outcome: "success", focusPanel: "cost",
    vehicle: "Falcon 9 v1.0 (SpaceX)",
    era: "Commercial era",
    caption: "Fixed-price contracts plus a commodity engine. NASA estimated cost-plus development would have been ~10x.",
    detail: "List price of about $62M for 22.8 t to LEO in its later Block 5 form, roughly $2,700/kg. NASA's 2011 analysis estimated Falcon 9 development cost about $390M, versus roughly $4B under traditional cost-plus contracting. Nine-engine architecture made engine production a manufacturing-line problem rather than a bespoke one.",
    metrics: [["Cost to LEO", "~$2,720/kg nominal (2018 list)"], ["Dev cost (NASA est.)", "~$390M actual vs ~$4B cost-plus"], ["Engines per booster", "9 Merlins"], ["Design philosophy", "Engine as manufactured commodity"]],
    bottleneckSolved: "Launch cost structure",
    bottleneckCreated: "Booster expendability still dominates cost",
    dataProduct: "Engine acceptance test telemetry at production-line scale",
    rhyme: "When the engine becomes a SKU, the factory becomes the rocket.",
  },
  {
    id: "dragon", name: "Dragon berths with ISS", date: "2012-05-25", year: 2012.40,
    band: 3, scale: 20, payloadT: 22.8, type: "mission", funding: "fixedprice",
    outcome: "success", focusPanel: "mix",
    vehicle: "Falcon 9 / Dragon C2+ (SpaceX)",
    era: "Commercial era",
    caption: "NASA buys services instead of vehicles. Watch the funding mix: the commercial share starts its climb here.",
    detail: "First commercial spacecraft to berth with the ISS. Proved that NASA could buy services instead of vehicles, the contracting model that now underpins Artemis commercial landers and cargo.",
    metrics: [["Contract model", "Fixed-price service, not cost-plus"], ["NASA COTS investment", "~$396M to SpaceX"], ["World launches that year", "78"]],
    bottleneckSolved: "Commercial crew/cargo as a service category",
    bottleneckCreated: "Certification and safety cases for commercial vehicles",
    dataProduct: "Shared government and commercial review data packages",
    rhyme: "The procurement model changed before the technology did.",
  },
  {
    id: "f9landing", name: "Falcon 9 booster landing", date: "2015-12-21", year: 2015.97,
    band: 4, scale: 26, payloadT: 22.8, type: "reuse", funding: "venture",
    outcome: "success", focusPanel: "map",
    vehicle: "Falcon 9 Flight 20, OG2 (SpaceX)",
    era: "Reuse era",
    caption: "Boosters become fleet assets: tail numbers, utilization, per-unit health. Servers with grid fins.",
    detail: "First orbital-class booster to land propulsively after delivering payload to orbit. Internally funded development. Shifted launch economics from one-off hardware to fleet asset management: flights per booster, turnaround days, refurbishment cost per cycle.",
    metrics: [["Landing", "Landing Zone 1, first attempt"], ["Eventual fleet record", "B1067: 30+ flights"], ["Best turnaround", "~3 weeks between flights"], ["World launches that year", "87"]],
    bottleneckSolved: "Recovering the expensive 70% of the rocket",
    bottleneckCreated: "Fleet operations: tracking asset health across reflights",
    dataProduct: "Fleet reuse analytics: per-tail-number health, fatigue, and refurbishment telemetry",
    rhyme: "Boosters became servers: utilization, uptime, and per-unit health metrics.",
  },
  {
    id: "falconheavy", name: "Falcon Heavy", date: "2018-02-06", year: 2018.10,
    band: 4, scale: 24, payloadT: 63.8, type: "cost", funding: "venture",
    outcome: "success", focusPanel: "cost",
    vehicle: "Falcon Heavy (SpaceX)",
    era: "Reuse era",
    caption: "27 engines firing at once, ~$1,500/kg. Heavy lift stops being a national-program exclusive.",
    detail: "63.8 t to LEO at a list price near $97M with booster recovery, roughly $1,500/kg. Internally funded. Heavy lift stopped being a national-program exclusive. 27 engines firing simultaneously made engine-out tolerance a software and data problem.",
    metrics: [["Payload to LEO", "63.8 t"], ["Cost to LEO", "~$1,520/kg nominal, ~$1,900/kg in 2025 $"], ["First stage engines", "27 Merlins"], ["World launches that year", "114"]],
    bottleneckSolved: "Commercial heavy lift",
    bottleneckCreated: "Demand: heavy lift outran the payload market",
    dataProduct: "27-engine health monitoring with real-time engine-out decision logic",
    rhyme: "Redundancy at scale only works if the telemetry layer can arbitrate it.",
  },
  {
    id: "crewdragon", name: "Crew Dragon Demo-2", date: "2020-05-30", year: 2020.41,
    band: 4, scale: 22, payloadT: 22.8, type: "mission", funding: "fixedprice",
    outcome: "success", focusPanel: "map",
    vehicle: "Falcon 9 / Crew Dragon (SpaceX)",
    era: "Reuse era",
    caption: "Crew supervise, software flies. The safety case is now mostly a data artifact.",
    detail: "First commercial vehicle to carry crew to orbit, ending a nine-year US human launch gap. Touchscreen flight interfaces backed by autonomous flight software: crew supervise, software flies.",
    metrics: [["US crew launch gap closed", "9 years"], ["Primary control mode", "Autonomous, crew supervisory"], ["World launches that year", "114"]],
    bottleneckSolved: "Commercial human spaceflight certification",
    bottleneckCreated: "Software assurance as the long pole in safety cases",
    dataProduct: "Software verification evidence as a first-class deliverable",
    rhyme: "The safety case is now mostly a data and software artifact.",
  },
  {
    id: "terran1", name: "Terran 1: Good Luck, Have Fun", date: "2023-03-22", year: 2023.22,
    band: 5, scale: 22, payloadT: 1.25, type: "manufacturing", funding: "venture",
    outcome: "partial", focusPanel: "map",
    vehicle: "Terran 1 (Relativity Space)",
    era: "Production era",
    caption: "85% printed by mass survives Max-Q on venture funding. A partial flight that fully proved the manufacturing thesis.",
    detail: "About 85% 3D printed by mass, the largest additively manufactured object to attempt orbital flight. Venture-funded: Relativity has raised over $1.3B including a $650M Series E. Survived Max-Q, validating printed primary structures. Second stage failed to reach orbit. Relativity retired Terran 1 and redirected to Terran R.",
    metrics: [["Printed by mass", "~85%"], ["Max-Q", "Passed: printed structure validated"], ["Funding", ">$1.3B venture raised (incl. $650M Series E)"], ["Disposition", "Retired as pathfinder"]],
    bottleneckSolved: "Additive manufacturing at rocket primary-structure scale",
    bottleneckCreated: "Scaling printed production to a reusable medium-heavy vehicle",
    dataProduct: "Printer telemetry, NCR clustering, engine-test anomaly detection, build-to-flight lineage",
    rhyme: "A partial flight that fully proved the manufacturing thesis. Honest framing beats spin.",
  },
  {
    id: "starshipcatch", name: "Starship booster catch", date: "2024-10-13", year: 2024.78,
    band: 5, scale: 30, payloadT: 100, type: "reuse", funding: "venture",
    outcome: "success", focusPanel: "map",
    vehicle: "Starship Flight 5 (SpaceX)",
    era: "Production era",
    caption: "The test campaign is the data product. Hardware-rich iteration is CI/CD with cryogenics.",
    detail: "Super Heavy booster caught by launch tower arms on first attempt. The test campaign itself is the data product: each flight is an instrumented experiment with thousands of channels feeding the next iteration, on a cadence measured in months, not years.",
    metrics: [["Booster", "Super Heavy, 33 Raptors"], ["Recovery mode", "Tower catch, zero ground transit"], ["Iteration cadence", "Months between full-stack tests"], ["World launches that year", "261"]],
    bottleneckSolved: "Rapid full-stack iteration with recovery",
    bottleneckCreated: "Production rate: building vehicles faster than testing consumes them",
    dataProduct: "Flight-test campaigns as versioned datasets feeding design iteration",
    rhyme: "Hardware-rich iteration is just CI/CD with cryogenics.",
  },
  {
    id: "fleetscale", name: "Launch at fleet scale", date: "2025-12-31", year: 2025.9,
    band: 4, scale: 38, payloadT: 22.8, type: "dataops", funding: "fixedprice",
    outcome: "success", focusPanel: "mix",
    vehicle: "Falcon 9 / Heavy fleet (SpaceX)",
    era: "Production era",
    caption: "330 world attempts, 70% commercial, 165 from one vehicle family. At cadence, launch is a data platform problem.",
    detail: "2025 set the record: 330 orbital launch attempts worldwide, 165 of them Falcon 9 flights from a single vehicle family. Commercial operators flew about 70% of all attempts. At this cadence, launch is fleet operations: range scheduling, booster assignment, weather modeling, and anomaly disposition are the daily workload, not the exception.",
    metrics: [["World attempts, 2025", "330 (record)"], ["Falcon 9 alone", "165 flights"], ["Commercial share", "~70% of attempts"], ["Dominant workload", "Scheduling, fleet health, anomaly disposition"]],
    bottleneckSolved: "Cadence as a repeatable operations discipline",
    bottleneckCreated: "Decision velocity: humans in the loop become the rate limiter",
    dataProduct: "Launch operations as a governed data platform: readiness, range, fleet health in one pane",
    rhyme: "This is the thesis. At cadence, launch is a data platform problem.",
  },
  {
    id: "terranR", name: "Terran R target", date: "2026 (planned)", year: 2026.75,
    band: 5, scale: 28, payloadT: 33.5, type: "manufacturing", funding: "venture",
    outcome: "planned", focusPanel: "map",
    vehicle: "Terran R (Relativity Space)",
    era: "Production era",
    caption: "Manufacturable reuse. The advantage is the factory-to-flight data loop.",
    detail: "Medium-to-heavy reusable launch vehicle, planned for Cape Canaveral with a stated late 2026 target. Relativity has stated more than $3B in launch service agreements across government, commercial, and telecom customers. 13 Aeon R engines on the first stage; payload class of 23.5 t reusable and 33.5 t expendable to LEO.",
    metrics: [["Stated backlog", ">$3B in LSAs (company-stated)"], ["Payload to LEO", "23.5 t reusable / 33.5 t expendable"], ["First stage", "13 Aeon R engines"], ["Target", "Late 2026, Cape Canaveral (company-stated)"]],
    bottleneckSolved: "Manufacturable reuse: additive plus conventional hybrid production",
    bottleneckCreated: "Factory-to-flight data integration at production cadence",
    dataProduct: "The full stack: printer and machine telemetry, NCR intelligence, engine acceptance analytics, launch readiness lineage",
    rhyme: "The launch advantage is no longer only design. It is the factory-to-flight data loop.",
  },
  {
    id: "artemis", name: "Artemis commercial systems", date: "2027+ (roadmap)", year: 2028.4,
    band: 5, scale: 26, payloadT: 100, type: "dataops", funding: "fixedprice",
    outcome: "planned", focusPanel: "mix",
    vehicle: "HLS, CLPS, Gateway logistics (NASA + commercial)",
    era: "Production era",
    caption: "Mission assurance becomes auditing partner data. Lineage stops being hygiene and becomes the contract.",
    detail: "NASA's lunar roadmap depends on commercial landers, logistics, and reusable infrastructure. Mission assurance shifts from owning vehicles to auditing partner data: telemetry standards, readiness evidence, and cross-organization lineage become the integration layer.",
    metrics: [["Model", "NASA buys services, audits data"], ["Integration layer", "Cross-org telemetry and readiness standards"]],
    bottleneckSolved: "Sustained lunar presence via commercial supply chains",
    bottleneckCreated: "Multi-party data trust and provenance",
    dataProduct: "Cross-organization mission readiness with auditable lineage",
    rhyme: "Governance and lineage stop being internal hygiene and become the contract.",
  },
];

export const EVENTS_CHRONO: LaunchEvent[] = [...EVENTS].sort((a, b) => a.year - b.year);

export function fmtCost(v: number): string {
  return v >= 10000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toLocaleString()}`;
}

// Full-range "Big Numbers" — the four headline stats, derived once from YEAR_SERIES over the full
// window (inflation-adjusted cost). Presented as inline editorial text under the Overview thesis,
// not as a dashboard strip. Mirrors the windowed KPI logic that used to live in BottleneckMap.
export type BigNumberAccent = "text" | "share" | "cost";
export interface BigNumber { label: string; value: string; sub: string; accent: BigNumberAccent }

export function computeBigNumbers(): BigNumber[] {
  const attempts = YEAR_SERIES.reduce((s, d) => s + (d.attempts || 0), 0);
  const lastReal = [...YEAR_SERIES].reverse().find((d) => d.commercialPct != null);
  const costYrs = YEAR_SERIES.filter((d) => d.costMeta);
  const first = costYrs[0];
  const last = costYrs[costYrs.length - 1];
  const cost = first?.costAdj != null && last?.costAdj != null
    ? `${fmtCost(first.costAdj)} → ${fmtCost(last.costAdj)}` : "n/a";
  const costLabel = first?.costMeta && last?.costMeta
    ? `${first.costMeta.v} to ${last.costMeta.v}, 2025 $` : "";
  return [
    { label: "Timeline", value: `${FULL_WINDOW[0]} – ${FULL_WINDOW[1]}`, sub: "full range", accent: "text" },
    { label: "Launch attempts", value: attempts.toLocaleString(), sub: "orbital, total", accent: "text" },
    { label: "Commercial share",
      value: lastReal?.commercialPct != null ? `${Math.round(lastReal.commercialPct)}%` : "n/a",
      sub: lastReal ? `as of ${lastReal.year}` : "", accent: "share" },
    { label: "Cost per kg to LEO", value: cost, sub: costLabel, accent: "cost" },
  ];
}
