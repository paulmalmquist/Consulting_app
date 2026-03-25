import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export interface TradingFeatureCard {
  card_id: string | null;
  tenant_id: string;
  business_id: string;
  segment_id: string | null;
  brief_id: string | null;
  gap_category: string;
  title: string;
  description: string | null;
  priority_score: number | null;
  cross_vertical_flag: boolean | null;
  spec_json: Record<string, unknown>;
  meta_prompt: string | null;
  status: string;
  target_module: string | null;
  lineage_note: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchMarketFeatureCards(filters?: {
  segmentId?: string;
  gapCategory?: string;
  status?: string;
}): Promise<TradingFeatureCard[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return [];
  }

  let query = supabase
    .from("trading_feature_cards")
    .select("*")
    .order("priority_score", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.segmentId) {
    query = query.eq("segment_id", filters.segmentId);
  }

  if (filters?.gapCategory) {
    query = query.eq("gap_category", filters.gapCategory);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch market feature cards:", error);
    return [];
  }

  return data || [];
}

export interface MarketSegment {
  segment_id: string;
  tenant_id: string;
  business_id: string;
  category: string;
  subcategory: string;
  segment_name: string;
  tickers: unknown[];
  tier: number;
  rotation_cadence_days: number;
  last_rotated_at: string | null;
  rotation_priority_score: number | null;
  heat_triggers: Record<string, unknown>;
  research_protocol: string;
  cross_vertical: Record<string, unknown>;
  research_runs: unknown[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchMarketSegments(): Promise<MarketSegment[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("market_segments")
    .select("*")
    .eq("is_active", true)
    .order("category")
    .order("segment_name");

  if (error) {
    console.error("Failed to fetch market segments:", error);
    return [];
  }

  return data || [];
}

export function formatCardStatus(status: string): {
  label: string;
  color: string;
} {
  const statusMap: Record<
    string,
    { label: string; color: string }
  > = {
    identified: { label: "Identified", color: "bg-blue-900 text-blue-300" },
    spec_ready: { label: "Spec Ready", color: "bg-amber-900 text-amber-300" },
    in_progress: { label: "In Progress", color: "bg-purple-900 text-purple-300" },
    shipped: { label: "Shipped", color: "bg-green-900 text-green-300" },
    deferred: { label: "Deferred", color: "bg-gray-700 text-gray-300" },
  };

  return statusMap[status] || { label: status, color: "bg-gray-700 text-gray-300" };
}

export function formatGapCategory(category: string): string {
  const categoryMap: Record<string, string> = {
    data_source: "Data Source",
    calculation: "Calculation",
    screening: "Screening",
    visualization: "Visualization",
    backtesting: "Backtesting",
    risk_model: "Risk Model",
    alert: "Alert",
    cross_vertical: "Cross-Vertical",
  };

  return categoryMap[category] || category;
}
