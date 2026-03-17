export const RADAR_SECTOR_ORDER = [
  "multifamily",
  "industrial",
  "office",
  "retail",
  "student_housing",
  "medical_office",
  "mixed_use",
  "hospitality",
] as const;

export const RADAR_STAGE_ORDER = [
  "sourced",
  "screening",
  "loi",
  "dd",
  "ic",
  "closing",
  "ready",
] as const;

export type DealRadarSector = (typeof RADAR_SECTOR_ORDER)[number];
export type DealRadarStage = (typeof RADAR_STAGE_ORDER)[number];
export type DealRadarMode = "stage" | "capital" | "risk" | "fit" | "market";
export type DealRadarAlert =
  | "stale"
  | "capital_gap"
  | "missing_diligence"
  | "concentration"
  | "priority";

export interface PipelineDealSummary {
  deal_id: string;
  env_id: string;
  fund_id?: string | null;
  fund_name?: string | null;
  deal_name: string;
  status: string;
  source?: string | null;
  strategy?: string | null;
  property_type?: string | null;
  target_close_date?: string | null;
  headline_price?: number | string | null;
  target_irr?: number | string | null;
  target_moic?: number | string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
  city?: string | null;
  state?: string | null;
  sponsor_name?: string | null;
  broker_name?: string | null;
  broker_org?: string | null;
  equity_required?: number | string | null;
  last_activity_at?: string | null;
  activity_count?: number | null;
  property_count?: number | null;
  attention_flags?: string[] | null;
}

export interface PipelinePropertySummary {
  property_id: string;
  property_name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  units?: number | null;
  sqft?: number | null;
  occupancy?: number | null;
  noi?: number | null;
  asking_cap_rate?: number | null;
}

export interface PipelineTrancheSummary {
  tranche_id: string;
  tranche_name: string;
  tranche_type?: string | null;
  close_date?: string | null;
  commitment_amount?: number | null;
  status?: string | null;
}

export interface PipelineActivitySummary {
  activity_id?: string;
  activity_type: string;
  body?: string | null;
  occurred_at: string;
  created_by?: string | null;
}

export interface PipelineContactSummary {
  contact_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  org?: string | null;
  role?: string | null;
}

export type DealRadarDateRange = "30d" | "90d" | "ytd" | "all";

export interface DealRadarFilters {
  fund: string | null;
  strategy: string | null;
  sector: string | null;
  stage: string | null;
  dateRange: DealRadarDateRange;
  q: string;
}

export interface DealRadarNode {
  dealId: string;
  dealName: string;
  sector: DealRadarSector;
  stage: DealRadarStage;
  originalStage: string;
  fundId?: string;
  fundName?: string;
  city?: string;
  state?: string;
  strategy?: string;
  source?: string;
  headlinePrice?: number;
  equityRequired?: number;
  targetIrr?: number;
  targetMoic?: number;
  brokerName?: string;
  brokerOrg?: string;
  sponsorName?: string;
  lastUpdatedAt?: string;
  propertyCount: number;
  activityCount: number;
  blockers: string[];
  alerts: DealRadarAlert[];
  readinessScore: number;
  riskScore: number;
  fitScore: number;
  marketScore: number;
  valueForSizing: number;
  locationLabel: string;
  searchText: string;
}

export interface DealRadarSectorExposure {
  sector: DealRadarSector;
  label: string;
  value: number;
  share: number;
  dealCount: number;
}

export interface DealRadarFundExposure {
  fundId: string | null;
  fundName: string;
  value: number;
  share: number;
  dealCount: number;
}

export interface DealRadarMarketExposure {
  market: string;
  value: number;
  share: number;
  dealCount: number;
}

export interface DealRadarBottleneck {
  id: string;
  label: string;
  detail: string;
  severity: "critical" | "warning" | "info";
}

export interface DealRadarSummary {
  totalPipelineValue: number;
  totalEquityRequired: number;
  dealCount: number;
  averageDealSize: number;
  weightedPipeline: number;
  stageCounts: Record<DealRadarStage, number>;
  sectorExposure: DealRadarSectorExposure[];
  fundExposure: DealRadarFundExposure[];
  marketExposure: DealRadarMarketExposure[];
  bottlenecks: DealRadarBottleneck[];
  archivedCounts: {
    closed: number;
    dead: number;
  };
}

export interface DealRadarLayoutNode {
  key: string;
  kind: "deal" | "cluster";
  x: number;
  y: number;
  size: number;
  sector: DealRadarSector;
  stage: DealRadarStage;
  alerts: DealRadarAlert[];
  label: string;
  deal?: DealRadarNode;
  clusterCount?: number;
  clusterDeals?: DealRadarNode[];
}

export interface DealRadarDetailBundle {
  properties: PipelinePropertySummary[];
  tranches: PipelineTrancheSummary[];
  activities: PipelineActivitySummary[];
  contacts: PipelineContactSummary[];
}

export interface DealRadarRecommendation {
  id: string;
  title: string;
  detail: string;
  actionLabel: string;
}
