import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import * as lib from "@/lib/telemetry/relativityMes";
import BuildOverviewConsole from "./BuildOverviewConsole";
import BuildGenealogyConsole from "./BuildGenealogyConsole";
import NcrTraceabilityConsole from "./NcrTraceabilityConsole";
import CostReconciliationConsole from "./CostReconciliationConsole";
import LineageSourceConsole from "./LineageSourceConsole";
import BuildAnalyticsConsole from "./BuildAnalyticsConsole";

// Keep useRel + servingLabel real; mock only the network fetchers so the consoles render over canned
// serving payloads (the dashboards read APIs, never local data).
vi.mock("@/lib/telemetry/relativityMes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/telemetry/relativityMes")>();
  return {
    ...actual,
    getOverview: vi.fn(), getGenealogy: vi.fn(), getWhereUsed: vi.fn(),
    getNcr: vi.fn(), getCost: vi.fn(), getLineage: vi.fn(), getSourceRows: vi.fn(),
    getAnalytics: vi.fn(),
  };
});

const META = { source_kind: "live-rows" as const, serving_provenance: "seed-bootstrap", as_of: "2026-06-26", null_reason: null };

beforeEach(() => {
  vi.clearAllMocks();
  (lib.getSourceRows as Mock).mockResolvedValue({
    ...META, table: "rel_mes_vehicle", columns: [], rows: [], row_count: 0,
  });
});

describe("BuildOverviewConsole", () => {
  it("renders the synthetic banner and the per-vehicle serving rows", async () => {
    (lib.getOverview as Mock).mockResolvedValue({
      ...META,
      rows: [
        { vehicle_serial: "VEH-DEMO-001", build_status: "in_assembly", readiness_state: "blocked",
          work_order_count: 6, genealogy_edge_count: 32, open_ncr_count: 1, suspect_lot_count: 1,
          affected_by_suspect_lot: true, planned_cost: 100, actual_cost: 110, variance_amount: 10, variance_pct: 6.3 },
      ],
    });
    render(<BuildOverviewConsole envId="telemetry" />);
    expect(await screen.findByRole("heading", { name: "Build Overview" })).toBeTruthy();
    expect(screen.getByText("synthetic sandbox")).toBeTruthy();
    expect((await screen.findAllByText("VEH-DEMO-001")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("blocked")).toBeTruthy();
  });

  it("fails closed (null_reason) when the serving mart is empty — no fabricated rows", async () => {
    (lib.getOverview as Mock).mockResolvedValue({
      rows: [], source_kind: "unavailable", serving_provenance: null, as_of: null,
      null_reason: "serving_not_loaded",
    });
    render(<BuildOverviewConsole envId="telemetry" />);
    expect(await screen.findByText("Serving mart not loaded")).toBeTruthy();
    expect(screen.getByText(/serving_not_loaded/)).toBeTruthy();
  });
});

describe("BuildGenealogyConsole", () => {
  beforeEach(() => {
    (lib.getGenealogy as Mock).mockResolvedValue({
      ...META,
      vehicles: [{ vehicle_serial: "VEH-DEMO-001", build_status: "in_assembly" }],
      rows: [
        { vehicle_serial: "VEH-DEMO-001", parent_node_id: "SN-001-TPS", child_node_id: "LOT-7788",
          child_type: "lot", part_no: "PN-TPS-SEAL", lot_no: "LOT-7788", reference_designator: "RD-TPS-SEAL",
          ncr_id: "NCR-0001", disposition_type: "rework", installed_at: "2026-06-11", installed_by: "OP-1042" },
      ],
      ncrs: [{ ncr_id: "NCR-0001", status: "open", severity: "major", defect_code: "witness-mark",
        lot_no: "LOT-7788", affected_vehicle_count: 2 }],
    });
  });

  it("renders the as-built tree, open NCRs, and traces the suspect lot to two vehicles", async () => {
    (lib.getWhereUsed as Mock).mockResolvedValue({
      ...META, lot_no: "LOT-7788", vehicles: ["VEH-DEMO-001", "VEH-DEMO-002"],
      affected_vehicle_count: 2, rows: [{ vehicle_serial: "VEH-DEMO-001" }],
    });
    render(<BuildGenealogyConsole />);
    expect(await screen.findByRole("heading", { name: "Build Genealogy" })).toBeTruthy();
    // LOT-7788 appears as both a tree-row link and a where-used chip
    const lots = await screen.findAllByText("LOT-7788");
    expect(lots.length).toBeGreaterThanOrEqual(1);
    // click the suspect-lot chip to run the where-used trace
    fireEvent.click(lots[lots.length - 1]);
    expect(await screen.findByText(/VEH-DEMO-001, VEH-DEMO-002/)).toBeTruthy();
  });
});

describe("NcrTraceabilityConsole", () => {
  it("renders NCR rows tied to vehicles + the KPI cards", async () => {
    (lib.getNcr as Mock).mockResolvedValue({
      ...META,
      kpis: { open_now: 1, major: 2, median_age_days: 10, top_defect_family: "witness-mark",
        vehicles_affected: 2, estimated_rework_cost: 6850, open_blocking: 1 },
      rows: [{ ncr_id: "NCR-0001", vehicle_serial: "VEH-DEMO-001", defect_code: "witness-mark",
        severity: "major", status: "open", age_days: 14, disposition_type: "rework",
        affected_vehicle_count: 2, estimated_rework_cost: 4200 }],
    });
    render(<NcrTraceabilityConsole envId="telemetry" />);
    expect(await screen.findByRole("heading", { name: "NCR Traceability" })).toBeTruthy();
    expect(await screen.findByText("NCR-0001")).toBeTruthy();
    expect(screen.getByText("Open now")).toBeTruthy();
  });
});

describe("CostReconciliationConsole", () => {
  it("renders the MES vs ERP seam with variance KPIs", async () => {
    (lib.getCost as Mock).mockResolvedValue({
      ...META,
      kpis: { standard_cost: 5000, actual_cost: 5700, total_variance: 700, variance_pct: 14,
        material_variance: 1000, labor_variance: 500, ncr_rework_cost: 4200, unreconciled_rows: 1 },
      rollup: [{ work_order_no: "WO-001-TPS", material_actual_cost: 1000, labor_minutes: 120,
        ncr_rework_cost: 4200, total_actual_cost: 5700 }],
      reconciliation: [{ work_order_no: "WO-001-TPS", mfg_order_no: "MFG-001-TPS", standard_cost: 5000,
        actual_cost: 5700, variance_amount: 700, variance_category: "input_qty", reconciliation_status: "exception" }],
    });
    render(<CostReconciliationConsole />);
    expect(await screen.findByRole("heading", { name: "Cost Reconciliation" })).toBeTruthy();
    expect(screen.getByText("Standard cost")).toBeTruthy();
    expect(await screen.findByText("MES actuals (physical truth)")).toBeTruthy();
    expect(screen.getByText("ERP settlement (financial truth)")).toBeTruthy();
  });
});

describe("LineageSourceConsole", () => {
  it("proves the live serving path and lists the source tables", async () => {
    (lib.getLineage as Mock).mockResolvedValue({
      ...META,
      rows: [
        { object_name: "rel_mes_vehicle", layer: "source", source_system: "MES", grain: "vehicle_serial",
          row_count: 3, dashboard_consumers: '["Build Overview"]', ingest_batch_id: "rel-mes-seed-v1",
          source_system_layer: "rel_*" },
        { object_name: "rel_build_overview", layer: "gold/serving", source_system: "Gold",
          row_count: 3, source_system_layer: "gold.rel_build_overview -> rel_build_overview" },
      ],
      serving: { rel_build_overview: { row_count: 3, serving_provenance: "seed-bootstrap" } },
    });
    render(<LineageSourceConsole />);
    expect(await screen.findByRole("heading", { name: "Lineage & Source Tables" })).toBeTruthy();
    expect(await screen.findByText("rel_mes_vehicle")).toBeTruthy();
    expect(screen.getByText(/Live serving/)).toBeTruthy();
  });

  it("reflects BigQuery-gold serving in the medallion path when serving is reloaded from BigQuery", async () => {
    (lib.getLineage as Mock).mockResolvedValue({
      ...META, serving_provenance: "bigquery-gold",
      rows: [{ object_name: "rel_mes_vehicle", layer: "source", source_system: "MES", row_count: 3,
        dashboard_consumers: "[]", ingest_batch_id: "rel-mes-seed-v1", source_system_layer: "rel_*" }],
      serving: { rel_build_overview: { row_count: 3, serving_provenance: "bigquery-gold" } },
    });
    render(<LineageSourceConsole />);
    expect((await screen.findAllByText(/BigQuery medallion/)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/bigquery-gold \(synced from the BigQuery Gold marts\)/)).toBeTruthy();
    // Databricks gold stays fail-closed (its tables aren't materialized even when serving is BigQuery)
    expect(screen.getAllByText(/Medallion not materialized/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders honest medallion links: BigQuery live, Databricks fail-closed", async () => {
    (lib.getLineage as Mock).mockResolvedValue({
      ...META, // serving_provenance = seed-bootstrap -> Databricks medallion not materialized
      rows: [{ object_name: "rel_mes_vehicle", layer: "source", source_system: "MES", row_count: 3,
        dashboard_consumers: "[]", ingest_batch_id: "rel-mes-seed-v1", source_system_layer: "rel_*" }],
      serving: { rel_build_overview: { row_count: 3, serving_provenance: "seed-bootstrap" } },
    });
    render(<LineageSourceConsole />);
    // BigQuery medallion is materialized -> live links
    expect(await screen.findByText("BigQuery medallion (GCP) — live")).toBeTruthy();
    const bqDataset = screen.getByText(/Open BigQuery dataset/);
    expect(bqDataset.closest("a")?.getAttribute("href")).toContain("console.cloud.google.com/bigquery");
    // a BigQuery gold table is a LIVE anchor to the BQ console
    const bqGoldAnchor = screen.getAllByRole("link").find(
      (a) => a.getAttribute("href")?.includes("relativity_mes") && a.textContent?.includes("gold_rel_build_overview"));
    expect(bqGoldAnchor).toBeTruthy();
    // Databricks catalog (novendor_1) is live; its gold tables are fail-closed (not materialized)
    expect(screen.getByText("Databricks medallion & Unity Catalog")).toBeTruthy();
    expect(screen.getByText(/Open catalog novendor_1/).closest("a")?.getAttribute("href")).toContain("dbc-2504bec5-b5ab");
    expect(screen.getAllByText(/Medallion not materialized/).length).toBeGreaterThanOrEqual(1);
    // the Databricks gold label (exact text, no trailing ↗) is fail-closed -> not an anchor
    expect(screen.getByText("gold_rel_build_overview").closest("a")).toBeNull();
  });
});

describe("BuildAnalyticsConsole", () => {
  const ANALYTICS = {
    ...META,
    kpis: {
      total_variance: 9600, rework_share_pct: 25.8, recon_exception_count: 2,
      suspect_lot_vehicle_count: 2, busiest_work_center: "WC-NDE", defect_concentration_pct: 61.3,
    },
    blocks: {
      readiness: { rows: [
        { vehicle_serial: "VEH-DEMO-001", readiness_state: "blocked", driver: "open major NCR · suspect lot" },
        { vehicle_serial: "VEH-DEMO-002", readiness_state: "on_track", driver: "on track · suspect lot" },
      ], null_reason: null },
      asymmetry: { shared_exposure: ["VEH-DEMO-001", "VEH-DEMO-002"], rows: [
        { vehicle_serial: "VEH-DEMO-001", readiness_state: "blocked", open_major_ncr: 1, note: "open major NCR on the lot install" },
        { vehicle_serial: "VEH-DEMO-002", readiness_state: "on_track", open_major_ncr: 0, note: "lot installed; no open major NCR on it" },
      ], null_reason: null },
      blast: { rows_present: true, lot_id: "LOT-7788", part_number: "PN-TPS-SEAL",
        vehicles: [{ vehicle_serial: "VEH-DEMO-001", readiness_state: "blocked" }],
        ncrs: [{ ncr_id: "NCR-0001", severity: "major", status: "open", rework_cost: 4200 }],
        work_orders: [{ work_order_id: "WO-001-TPS", variance_pct: 70, actual_cost: 16000, standard_cost: 9400 }],
        edges: [], null_reason: null },
      bridge: { reconciled_pct: 95.6, residual_total: 700, rows: [
        { vehicle_serial: "VEH-DEMO-001", planned_cost: 10000, material: 6000, labor_overhead: 5800, rework: 4200, residual: 0, actual_cost: 16000 },
      ], null_reason: null },
      pareto: { concentration_pct: 61.3, n_ncrs: 7, rows: [
        { cluster_label: "witness-mark·WC-NDE", ncr_count: 1, rework_cost: 4200, cumulative_rework_pct: 61.3 },
        { cluster_label: "weld-undercut·WC-WELD", ncr_count: 1, rework_cost: 2650, cumulative_rework_pct: 100 },
      ], null_reason: null },
      workcenter: { rows: [
        { work_center: "WC-NDE", subassembly: "TPS", actual_minutes: 180, std_minutes: 150, actual_std_ratio: 1.2, op_count: 6, low_n: false },
        { work_center: "WC-WELD", subassembly: "STR", actual_minutes: 80, std_minutes: 60, actual_std_ratio: 1.33, op_count: 2, low_n: true },
      ], null_reason: null },
      recon: { exception_threshold_pct: 25, threshold_sensitivity: [{ k: 25, exception_count: 2 }, { k: 50, exception_count: 1 }], rows: [
        { work_order_id: "WO-001-TPS", standard_cost: 9400, actual_cost: 16000, variance_pct: 70, is_exception: true },
      ], null_reason: null },
      disconfirmation: { checks_run: 3, findings: [
        { kind: "exception_without_ncr", ref: "WO-003-AVI", detail: "variance 37.5% but no linked NCR" },
      ], null_reason: null },
    },
  };

  it("renders the simulation-analysis surface with provenance chips + page copy", async () => {
    (lib.getAnalytics as Mock).mockResolvedValue(ANALYTICS);
    render(<BuildAnalyticsConsole />);
    expect(await screen.findByRole("heading", { name: "Build Analytics" })).toBeTruthy();
    expect(screen.getByText(/Current seed is a story\. Multi-seed stability is the analysis\./)).toBeTruthy();
    expect(screen.getAllByText("generated scenario input").length).toBeGreaterThan(0);
    expect(screen.getAllByText("emergent from simulation").length).toBeGreaterThan(0);
    expect(screen.getByText("low-n directional only")).toBeTruthy();
    // asymmetry + disconfirmation (non-authored finding) are the credibility panels
    expect(screen.getByText(/Why VEH-DEMO-001 vs VEH-DEMO-002 differ/)).toBeTruthy();
    expect(screen.getByText("exception_without_ncr")).toBeTruthy();
  });

  it("fails closed at the page level when core marts are empty", async () => {
    (lib.getAnalytics as Mock).mockResolvedValue({
      source_kind: "unavailable", serving_provenance: null, as_of: null,
      null_reason: "serving_not_loaded", kpis: null, blocks: {},
    });
    render(<BuildAnalyticsConsole />);
    expect(await screen.findByText("No analytics data")).toBeTruthy();
  });
});
