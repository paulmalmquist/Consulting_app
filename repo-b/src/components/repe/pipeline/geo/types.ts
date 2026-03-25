import type { DealRadarNode, DealRadarFilters } from "../radar/types";

export type GeographyLevel = "county" | "tract" | "block_group";
export type CompareMode = "tract" | "county" | "metro";

export interface GeoOverlayCatalogItem {
  metric_key: string;
  display_name: string;
  description?: string | null;
  category: string;
  units?: string | null;
  geography_levels: string[];
  compare_modes: string[];
  color_scale: string;
  source_name: string;
  source_url?: string | null;
  is_active: boolean;
}

export interface GeoNearbyDeal {
  deal_id: string;
  deal_name: string;
  stage: string;
  sector?: string | null;
  strategy?: string | null;
  fund_name?: string | null;
}

export interface GeoMapContextFeature {
  geoid: string;
  geography_level: GeographyLevel;
  name: string;
  geometry: GeoJSON.Geometry | null;
  metric_value: number | null;
  metric_label: string;
  units?: string | null;
  source_name?: string | null;
  dataset_vintage?: string | null;
  nearby_deals: GeoNearbyDeal[];
}

export interface GeoMapContextOverlay {
  metric_key: string;
  label: string;
  units?: string | null;
  source_name: string;
  dataset_vintage?: string | null;
  geography_level: GeographyLevel;
  color_scale: string;
  bins: Array<{ min: number; max: number; label: string }>;
}

export interface GeoMapContextResponse {
  overlay: GeoMapContextOverlay;
  features: GeoMapContextFeature[];
  total_count: number;
}

export interface GeoMetricFact {
  label: string;
  value: number | null;
  units?: string | null;
  source_name?: string | null;
  dataset_vintage?: string | null;
}

export interface GeoDealComparison {
  metric_key: string;
  label: string;
  subject_value: number | null;
  benchmark_value: number | null;
  delta: number | null;
  units?: string | null;
}

export interface GeoDealFit {
  sector_fit_score: number | null;
  positives: string[];
  risks: string[];
  benchmark_deltas: GeoDealComparison[];
}

export interface GeoCommentarySeed {
  facts: Record<string, string | number | null>;
  safe_narrative: string[];
}

export interface GeoDealContextResponse {
  deal: {
    deal_id: string;
    property_id?: string | null;
    deal_name: string;
    sector?: string | null;
    strategy?: string | null;
    fund_name?: string | null;
    stage: string;
    property_name?: string | null;
    city?: string | null;
    state?: string | null;
    lat?: number | null;
    lon?: number | null;
    county_geoid?: string | null;
    tract_geoid?: string | null;
    block_group_geoid?: string | null;
  };
  underwriting: {
    headline_price?: number | null;
    equity_required?: number | null;
    target_irr?: number | null;
    target_moic?: number | null;
  };
  tract_profile: Record<string, GeoMetricFact>;
  county_profile: Record<string, GeoMetricFact>;
  metro_benchmark: Record<string, GeoMetricFact>;
  hazard: Record<string, GeoMetricFact>;
  fit: GeoDealFit;
  commentary_seed: GeoCommentarySeed;
}

export interface GeoPipelineMarker {
  deal_id: string;
  canonical_property_id?: string | null;
  deal_name: string;
  status: string;
  lat: number;
  lon: number;
  property_name?: string;
  property_type?: string;
  headline_price?: number | string | null;
}

export interface GeoDealMarker {
  node: DealRadarNode;
  marker: GeoPipelineMarker;
}

export interface DealGeoWorkspaceProps {
  envId: string;
  filters: DealRadarFilters;
  nodes: DealRadarNode[];
  markers: GeoPipelineMarker[];
  selectedDealId?: string | null;
  onSelectDeal: (dealId: string | null) => void;
}
