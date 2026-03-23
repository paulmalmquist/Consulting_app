export interface SourceRef {
  label: string;
  path: string;
  status?: "ok" | "missing" | "fallback";
  note?: string;
}

export interface MarketStatusCard {
  engineStatus: string;
  regimeLabel: string;
  confidenceText: string;
  latestDigestDate: string | null;
  pipelineState: string;
  sourceHealthNotes: string[];
}

export interface RotationTarget {
  segmentId?: string;
  name: string;
  category?: string;
  tier?: string;
  overdueRatio?: string;
  note?: string;
}

export interface IntelCard {
  title: string;
  summary: string;
  bullets: string[];
  impact?: string;
  threat?: string;
  opportunity?: string;
  tag?: string;
}

export interface BuildQueueCard {
  id: string;
  title: string;
  priority: string;
  estimatedEffort?: string;
  status: "shipped" | "planned";
  summary: string;
  whyItMatters: string;
  segment?: string;
  crossVertical?: string;
  promptPath?: string;
}

export interface MarketLandingFeed {
  generatedAt: string;
  status: MarketStatusCard;
  rotation: {
    nextStep: string | null;
    summary: string | null;
    selectedSegments: RotationTarget[];
  };
  digest: {
    regimeSummary: string | null;
    topSignals: string[];
    crossVerticalAlertSummary: string | null;
    pipelineHealthSummary: string | null;
  };
  dailyIntel: IntelCard | null;
  competitorWatch: IntelCard[];
  salesPositioning: IntelCard[];
  featureRadar: IntelCard | null;
  demoAngle: IntelCard | null;
  buildQueue: BuildQueueCard[];
  sources: SourceRef[];
}
