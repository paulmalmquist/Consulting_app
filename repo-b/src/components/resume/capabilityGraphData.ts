// ---------------------------------------------------------------------------
// Compounding Capability Graph – data model, curve math, and career mapping
// Pure functions only – SSR safe, no DOM access.
// ---------------------------------------------------------------------------

export type GrowthCurve = "sigmoid" | "exponential" | "logarithmic" | "linear";

export type CapabilityLayer = {
  id: string;
  label: string;
  color: string;
  fillOpacity: number;
  startYear: number;
  maxLeverage: number;
  growthCurve: GrowthCurve;
  growthRate: number;
  weight: number;
  glowIntensity: number;
  tools: string[];
  description: string;
  outcomes: string[];
};

export type CapabilityMilestone = {
  id: string;
  year: number;
  layerId: string;
  title: string;
  description: string;
  spikeAmplitude: number;
  spikeWidth: number;
};

export type CompanyBand = {
  label: string;
  startYear: number;
  endYear: number;
  color: string;
};

export type CapabilityDataPoint = {
  year: number;
  ops: number;
  sql: number;
  bi: number;
  data_eng: number;
  repe: number;
  governance: number;
  ai: number;
};

// ---------------------------------------------------------------------------
// Layer definitions
// ---------------------------------------------------------------------------

export const CAPABILITY_LAYERS: CapabilityLayer[] = [
  {
    id: "ops",
    label: "Operational Systems",
    color: "#94A3B8",
    fillOpacity: 0.25,
    startYear: 2013,
    maxLeverage: 10,
    growthCurve: "sigmoid",
    growthRate: 0.6,
    weight: 1.0,
    glowIntensity: 0,
    tools: ["Excel", "PMO", "Reporting Cadence"],
    description: "Structured thinking + process discipline. The backbone that never goes away.",
    outcomes: ["Operational rigor", "Process discipline", "Reporting cadence"],
  },
  {
    id: "sql",
    label: "SQL / Data Structuring",
    color: "#14B8A6",
    fillOpacity: 0.25,
    startYear: 2014,
    maxLeverage: 12,
    growthCurve: "logarithmic",
    growthRate: 2.5,
    weight: 1.1,
    glowIntensity: 0,
    tools: ["SQL", "PowerPivot", "Data Modeling"],
    description: "First real leverage multiplier — stopped consuming data, started shaping it.",
    outcomes: ["Data structuring", "Query authorship", "Schema design"],
  },
  {
    id: "bi",
    label: "BI / Visualization",
    color: "#3B82F6",
    fillOpacity: 0.25,
    startYear: 2016,
    maxLeverage: 15,
    growthCurve: "sigmoid",
    growthRate: 0.8,
    weight: 1.2,
    glowIntensity: 0,
    tools: ["Tableau", "Power BI", "Dashboard Design"],
    description: "Data → decision interface. Where raw data became narrative.",
    outcomes: ["JPMC BI service line", "Executive dashboards", "Self-service analytics"],
  },
  {
    id: "data_eng",
    label: "Data Engineering",
    color: "#22C55E",
    fillOpacity: 0.25,
    startYear: 2019,
    maxLeverage: 14,
    growthCurve: "linear",
    growthRate: 1.8,
    weight: 1.5,
    glowIntensity: 0,
    tools: ["Azure", "Databricks", "PySpark", "ETL Pipelines"],
    description: "Moved from reporting → infrastructure. Things got serious.",
    outcomes: ["ETL automation", "Warehouse architecture", "Pipeline orchestration"],
  },
  {
    id: "repe",
    label: "REPE / Finance",
    color: "#F59E0B",
    fillOpacity: 0.25,
    startYear: 2019,
    maxLeverage: 13,
    growthCurve: "sigmoid",
    growthRate: 0.7,
    weight: 1.4,
    glowIntensity: 0,
    tools: ["Waterfall Models", "Fund Modeling", "Capital Structures"],
    description: "Domain depth that makes everything else valuable. Without this, just another data person.",
    outcomes: ["Fund-level modeling", "REPE analytics", "Capital structure analysis"],
  },
  {
    id: "governance",
    label: "Semantic / Governance",
    color: "#EAB308",
    fillOpacity: 0.28,
    startYear: 2021,
    maxLeverage: 16,
    growthCurve: "exponential",
    growthRate: 1.2,
    weight: 1.6,
    glowIntensity: 0.3,
    tools: ["Semantic Layer", "Data Governance", "Standardized Reporting"],
    description: "System coherence at scale. Maturity, not experimentation.",
    outcomes: ["Governed warehouse", "Semantic layer", "Standardized enterprise reporting"],
  },
  {
    id: "ai",
    label: "AI Systems",
    color: "#A855F7",
    fillOpacity: 0.3,
    startYear: 2023,
    maxLeverage: 20,
    growthCurve: "exponential",
    growthRate: 1.8,
    weight: 2.0,
    glowIntensity: 0.6,
    tools: ["LLM Systems", "RAG", "Winston / Business OS", "AI Workflows"],
    description: "Explosive convex curve — different physics. Transformed BI into an execution layer.",
    outcomes: ["Winston Business OS", "AI analytics workflows", "LLM-driven decision systems"],
  },
];

// ---------------------------------------------------------------------------
// Milestones – embedded as gaussian curve inflections, not detached labels
// ---------------------------------------------------------------------------

export const CAPABILITY_MILESTONES: CapabilityMilestone[] = [
  {
    id: "ms-jpmc-bi",
    year: 2018,
    layerId: "bi",
    title: "JPMC BI Platform",
    description: "Built enterprise BI service line for JPMorgan Chase — first real dashboard infrastructure at scale.",
    spikeAmplitude: 0.3,
    spikeWidth: 0.8,
  },
  {
    id: "ms-databricks-etl",
    year: 2020,
    layerId: "data_eng",
    title: "Databricks ETL Automation",
    description: "Automated ETL pipelines on Databricks — moved from manual reporting to production data infrastructure.",
    spikeAmplitude: 0.4,
    spikeWidth: 0.9,
  },
  {
    id: "ms-semantic-warehouse",
    year: 2022,
    layerId: "governance",
    title: "Semantic Layer + Warehouse",
    description: "Built governed warehouse with semantic layer — system coherence at enterprise scale.",
    spikeAmplitude: 0.35,
    spikeWidth: 0.8,
  },
  {
    id: "ms-ai-winston",
    year: 2024,
    layerId: "ai",
    title: "AI Analytics + Winston",
    description: "Built Winston Business OS with AI analytics, conversational BI, and LLM-driven decision systems.",
    spikeAmplitude: 0.5,
    spikeWidth: 0.7,
  },
];

// ---------------------------------------------------------------------------
// Company bands – subtle background reference areas
// ---------------------------------------------------------------------------

export const COMPANY_BANDS: CompanyBand[] = [
  { label: "JLL (Early)", startYear: 2013, endYear: 2017, color: "rgba(148,163,184,0.04)" },
  { label: "JLL (BI Growth)", startYear: 2017, endYear: 2019, color: "rgba(59,130,246,0.04)" },
  { label: "Kayne Anderson", startYear: 2019, endYear: 2022, color: "rgba(245,158,11,0.04)" },
  { label: "JLL (Director / AI)", startYear: 2022, endYear: 2026, color: "rgba(168,85,247,0.04)" },
];

// ---------------------------------------------------------------------------
// Curve functions – each layer follows its own growth archetype
// ---------------------------------------------------------------------------

function sigmoid(t: number, rate: number, midpoint: number): number {
  return 1 / (1 + Math.exp(-rate * (t - midpoint)));
}

function computeBaseCurve(
  layer: CapabilityLayer,
  year: number,
): number {
  if (year < layer.startYear) return 0;

  const elapsed = year - layer.startYear;
  const maxYears = 2026 - layer.startYear;

  switch (layer.growthCurve) {
    case "sigmoid": {
      const midpoint = maxYears * 0.35;
      const raw = sigmoid(elapsed, layer.growthRate, midpoint);
      const base = sigmoid(0, layer.growthRate, midpoint);
      const ceiling = sigmoid(maxYears, layer.growthRate, midpoint);
      return layer.maxLeverage * (raw - base) / (ceiling - base);
    }
    case "exponential": {
      const raw = 1 - Math.exp(-layer.growthRate * elapsed);
      const ceiling = 1 - Math.exp(-layer.growthRate * maxYears);
      return layer.maxLeverage * (raw / ceiling);
    }
    case "logarithmic": {
      const raw = Math.log(1 + layer.growthRate * elapsed);
      const ceiling = Math.log(1 + layer.growthRate * maxYears);
      return layer.maxLeverage * (raw / ceiling);
    }
    case "linear": {
      return layer.maxLeverage * Math.min(1, (layer.growthRate * elapsed) / (layer.growthRate * maxYears));
    }
  }
}

function gaussianSpike(year: number, milestoneYear: number, amplitude: number, width: number): number {
  const diff = year - milestoneYear;
  return amplitude * Math.exp(-(diff * diff) / (2 * width * width));
}

function computeLayerValue(
  layer: CapabilityLayer,
  year: number,
  milestones: CapabilityMilestone[],
): number {
  const base = computeBaseCurve(layer, year);
  if (base === 0) return 0;

  let spikeTotal = 0;
  for (const ms of milestones) {
    if (ms.layerId === layer.id) {
      spikeTotal += gaussianSpike(year, ms.year, ms.spikeAmplitude * layer.maxLeverage, ms.spikeWidth);
    }
  }

  return (base + spikeTotal) * layer.weight;
}

// ---------------------------------------------------------------------------
// Data generation – produces the chart dataset
// ---------------------------------------------------------------------------

export const LAYER_IDS = ["ops", "sql", "bi", "data_eng", "repe", "governance", "ai"] as const;
export type LayerId = (typeof LAYER_IDS)[number];

export function generateCapabilityChartData(
  startYear: number = 2013,
  endYear: number = 2026,
  stepsPerYear: number = 12,
): CapabilityDataPoint[] {
  const points: CapabilityDataPoint[] = [];
  const totalSteps = (endYear - startYear) * stepsPerYear;

  for (let i = 0; i <= totalSteps; i++) {
    const year = startYear + i / stepsPerYear;
    const point: CapabilityDataPoint = {
      year: Math.round(year * 100) / 100,
      ops: 0,
      sql: 0,
      bi: 0,
      data_eng: 0,
      repe: 0,
      governance: 0,
      ai: 0,
    };

    for (const layer of CAPABILITY_LAYERS) {
      const value = computeLayerValue(layer, year, CAPABILITY_MILESTONES);
      point[layer.id as LayerId] = Math.round(value * 100) / 100;
    }

    points.push(point);
  }

  return points;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getLayerById(id: string): CapabilityLayer | undefined {
  return CAPABILITY_LAYERS.find((l) => l.id === id);
}

export function getMilestoneById(id: string): CapabilityMilestone | undefined {
  return CAPABILITY_MILESTONES.find((m) => m.id === id);
}

export function getCompanyAtYear(year: number): CompanyBand | undefined {
  return COMPANY_BANDS.find((b) => year >= b.startYear && year < b.endYear);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
