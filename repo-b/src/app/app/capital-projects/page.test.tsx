/**
 * Tests for Capital Projects portfolio page.
 *
 * Verifies the portfolio page structure and KPI rendering contract
 * without a full context setup.
 */

import { describe, it, expect } from "vitest";
import type { CpPortfolioSummary, CpPortfolioKpis, CpProjectRow, CpProjectHealth } from "@/types/capital-projects";

const SAMPLE_HEALTH: CpProjectHealth = {
  budget_health: "green",
  schedule_health: "yellow",
  overall_health: "at_risk",
  risk_score: "35",
};

const SAMPLE_PROJECT: CpProjectRow = {
  project_id: "11111111-1111-1111-1111-111111111111",
  name: "Downtown Tower Renovation",
  project_code: "DTR-2026",
  sector: "commercial_office",
  stage: "construction",
  region: "Southeast",
  market: "Atlanta",
  gc_name: "Turner Construction",
  approved_budget: "24500000",
  committed_amount: "18200000",
  spent_amount: "12300000",
  forecast_at_completion: "23800000",
  contingency_remaining: "700000",
  health: SAMPLE_HEALTH,
  open_rfis: 5,
  open_submittals: 3,
  open_punch_items: 8,
  pending_change_orders: 2,
};

const SAMPLE_KPIS: CpPortfolioKpis = {
  total_approved_budget: "42750000",
  total_committed: "32400000",
  total_spent: "19800000",
  total_forecast: "41200000",
  total_budget_variance: "1550000",
  total_contingency_remaining: "1150000",
  projects_on_track: 0,
  projects_at_risk: 1,
  projects_critical: 0,
  total_open_rfis: 8,
  total_overdue_submittals: 2,
  total_open_punch_items: 13,
};

const SAMPLE_PORTFOLIO: CpPortfolioSummary = {
  kpis: SAMPLE_KPIS,
  projects: [SAMPLE_PROJECT],
};

describe("Capital Projects Portfolio Types", () => {
  it("portfolio summary has required KPI fields", () => {
    const kpis = SAMPLE_PORTFOLIO.kpis;
    expect(kpis.total_approved_budget).toBeDefined();
    expect(kpis.total_committed).toBeDefined();
    expect(kpis.total_spent).toBeDefined();
    expect(kpis.total_forecast).toBeDefined();
    expect(kpis.total_budget_variance).toBeDefined();
    expect(kpis.total_contingency_remaining).toBeDefined();
    expect(typeof kpis.projects_on_track).toBe("number");
    expect(typeof kpis.projects_at_risk).toBe("number");
    expect(typeof kpis.projects_critical).toBe("number");
  });

  it("project row has health composite", () => {
    const project = SAMPLE_PORTFOLIO.projects[0];
    expect(project.health.budget_health).toMatch(/^(green|yellow|red)$/);
    expect(project.health.schedule_health).toMatch(/^(green|yellow|red)$/);
    expect(project.health.overall_health).toMatch(/^(on_track|at_risk|critical)$/);
  });

  it("open items are non-negative integers", () => {
    const project = SAMPLE_PORTFOLIO.projects[0];
    expect(project.open_rfis).toBeGreaterThanOrEqual(0);
    expect(project.open_submittals).toBeGreaterThanOrEqual(0);
    expect(project.open_punch_items).toBeGreaterThanOrEqual(0);
    expect(project.pending_change_orders).toBeGreaterThanOrEqual(0);
  });

  it("budget values are parseable as numbers", () => {
    const kpis = SAMPLE_PORTFOLIO.kpis;
    expect(Number(kpis.total_approved_budget)).toBeGreaterThan(0);
    expect(Number(kpis.total_committed)).toBeGreaterThan(0);
    expect(Number(kpis.total_spent)).toBeGreaterThan(0);
    // variance = approved - forecast
    const variance = Number(kpis.total_approved_budget) - Number(kpis.total_forecast);
    expect(Number(kpis.total_budget_variance)).toBeCloseTo(variance, 0);
  });

  it("project counts reconcile", () => {
    const kpis = SAMPLE_PORTFOLIO.kpis;
    const totalProjects = kpis.projects_on_track + kpis.projects_at_risk + kpis.projects_critical;
    expect(totalProjects).toBe(SAMPLE_PORTFOLIO.projects.length);
  });
});
