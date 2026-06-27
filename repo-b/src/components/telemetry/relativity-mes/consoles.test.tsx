import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import * as lib from "@/lib/telemetry/relativityMes";
import BuildOverviewConsole from "./BuildOverviewConsole";
import BuildGenealogyConsole from "./BuildGenealogyConsole";
import NcrTraceabilityConsole from "./NcrTraceabilityConsole";
import CostReconciliationConsole from "./CostReconciliationConsole";
import LineageSourceConsole from "./LineageSourceConsole";

// Keep useRel + servingLabel real; mock only the network fetchers so the consoles render over canned
// serving payloads (the dashboards read APIs, never local data).
vi.mock("@/lib/telemetry/relativityMes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/telemetry/relativityMes")>();
  return {
    ...actual,
    getOverview: vi.fn(), getGenealogy: vi.fn(), getWhereUsed: vi.fn(),
    getNcr: vi.fn(), getCost: vi.fn(), getLineage: vi.fn(), getSourceRows: vi.fn(),
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
    expect(await screen.findByText("Build Overview")).toBeTruthy();
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
    expect(await screen.findByText("Build Genealogy")).toBeTruthy();
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
    expect(await screen.findByText("NCR Traceability")).toBeTruthy();
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
    expect(await screen.findByText("Cost Reconciliation")).toBeTruthy();
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
    expect(await screen.findByText("Lineage & Source Tables")).toBeTruthy();
    expect(await screen.findByText("rel_mes_vehicle")).toBeTruthy();
    expect(screen.getByText(/Live serving/)).toBeTruthy();
  });

  it("renders honest Databricks deep links: live catalog, fail-closed gold tables (bootstrap)", async () => {
    (lib.getLineage as Mock).mockResolvedValue({
      ...META, // serving_provenance = seed-bootstrap -> medallion not materialized
      rows: [{ object_name: "rel_mes_vehicle", layer: "source", source_system: "MES", row_count: 3,
        dashboard_consumers: "[]", ingest_batch_id: "rel-mes-seed-v1", source_system_layer: "rel_*" }],
      serving: { rel_build_overview: { row_count: 3, serving_provenance: "seed-bootstrap" } },
    });
    render(<LineageSourceConsole />);
    expect(await screen.findByText("Databricks medallion & Unity Catalog")).toBeTruthy();
    // catalog (novendor_1) exists now -> a live anchor to the workspace
    const catalog = await screen.findByText(/Open catalog novendor_1/);
    expect(catalog.closest("a")?.getAttribute("href")).toContain("dbc-2504bec5-b5ab");
    // gold tables not materialized -> fail-closed (disabled + reason), NOT a live link
    expect(screen.getByText("gold_rel_build_overview").closest("a")).toBeNull();
    expect(screen.getAllByText(/Medallion not materialized/).length).toBeGreaterThanOrEqual(1);
  });
});
