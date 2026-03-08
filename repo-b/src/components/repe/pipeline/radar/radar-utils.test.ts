import { describe, expect, it } from "vitest";
import type { DealRadarFilters, PipelineDealSummary } from "./types";
import {
  buildDealRadarNodes,
  computeRadarLayout,
  deriveReadinessScore,
  matchesDealRadarFilters,
} from "./utils";

function makeDeal(overrides: Partial<PipelineDealSummary> = {}): PipelineDealSummary {
  return {
    deal_id: overrides.deal_id || `deal-${Math.random().toString(16).slice(2)}`,
    env_id: overrides.env_id || "env-1",
    deal_name: overrides.deal_name || "Test Deal",
    status: overrides.status || "screening",
    source: overrides.source ?? "CBRE",
    strategy: overrides.strategy ?? "value_add",
    property_type: overrides.property_type ?? "multifamily",
    target_close_date: overrides.target_close_date ?? "2026-05-10",
    headline_price: overrides.headline_price ?? 42000000,
    target_irr: overrides.target_irr ?? 17.5,
    target_moic: overrides.target_moic ?? 2.1,
    created_at: overrides.created_at || "2026-03-01T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-03-06T00:00:00Z",
    city: overrides.city ?? "Phoenix",
    state: overrides.state ?? "AZ",
    sponsor_name: overrides.sponsor_name ?? "Desert Sponsor",
    broker_name: overrides.broker_name ?? "Morgan Ruiz",
    broker_org: overrides.broker_org ?? "CBRE",
    equity_required: overrides.equity_required ?? 15000000,
    last_activity_at: overrides.last_activity_at ?? new Date().toISOString(),
    activity_count: overrides.activity_count ?? 3,
    property_count: overrides.property_count ?? 1,
    attention_flags: overrides.attention_flags ?? [],
    fund_id: overrides.fund_id ?? "fund-1",
    fund_name: overrides.fund_name ?? "Meridian Growth Fund",
    notes: overrides.notes ?? null,
    created_by: overrides.created_by ?? "seed",
  };
}

describe("radar utils", () => {
  it("promotes strong closing deals into the execution-ready ring", () => {
    const readiness = deriveReadinessScore(makeDeal({ status: "closing" }));
    const nodes = buildDealRadarNodes([makeDeal({ status: "closing" })]);

    expect(readiness).toBeGreaterThanOrEqual(88);
    expect(nodes[0].stage).toBe("ready");
  });

  it("matches search by broker and sponsor without extra fetches", () => {
    const node = buildDealRadarNodes([
      makeDeal({
        deal_name: "Phoenix Logistics",
        broker_name: "Annie Case",
        sponsor_name: "Canyon Sponsor",
      }),
    ])[0];

    const brokerFilters: DealRadarFilters = { fund: null, strategy: null, sector: null, stage: null, q: "annie case" };
    const sponsorFilters: DealRadarFilters = { fund: null, strategy: null, sector: null, stage: null, q: "canyon sponsor" };

    expect(matchesDealRadarFilters(node, brokerFilters)).toBe(true);
    expect(matchesDealRadarFilters(node, sponsorFilters)).toBe(true);
  });

  it("clusters overflow deals inside a single sector-stage cell", () => {
    const nodes = buildDealRadarNodes(
      Array.from({ length: 14 }, (_, index) =>
        makeDeal({
          deal_id: `deal-${index}`,
          deal_name: `Industrial ${index}`,
          status: "dd",
          property_type: "industrial",
          headline_price: 40000000 + index * 1000000,
        }),
      ),
    );

    const layout = computeRadarLayout(nodes, "capital", false);
    const cluster = layout.find((item) => item.kind === "cluster");

    expect(cluster).toBeTruthy();
    expect(cluster?.clusterCount).toBeGreaterThan(0);
  });

  it("penalizes stale and incomplete deals in readiness scoring", () => {
    const strong = deriveReadinessScore(
      makeDeal({
        status: "ic",
        attention_flags: [],
        last_activity_at: new Date().toISOString(),
        property_count: 2,
        equity_required: 12000000,
      }),
    );
    const weak = deriveReadinessScore(
      makeDeal({
        status: "ic",
        attention_flags: ["stale", "capital_gap", "missing_diligence"],
        last_activity_at: "2025-12-01T00:00:00Z",
        property_count: 0,
        equity_required: null,
        broker_name: null,
        broker_org: null,
        source: null,
      }),
    );

    expect(strong).toBeGreaterThan(weak);
  });
});
