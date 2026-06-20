import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import GovernanceDashboard from "./GovernanceDashboard";
import type { GovernanceSummary, SecurityPosture, EvalResults, McpToolsResponse } from "@/lib/telemetry/copilot-api";

const { getGovernance, getEvals, getUsefulness, getMcpTools } = vi.hoisted(() => ({
  getGovernance: vi.fn(),
  getEvals: vi.fn(),
  getUsefulness: vi.fn(),
  getMcpTools: vi.fn(),
}));

vi.mock("@/lib/telemetry/copilot-api", () => ({ getGovernance, getEvals, getUsefulness, getMcpTools }));

const POSTURE: SecurityPosture = {
  enforced: [
    { control: "DB-layer RLS (tel_* tables)", detail: "21/21 tel_* tables have RLS enabled", evidence: "repo-b/db/schema; test" },
    { control: "App-layer tenant scoping (runtime boundary)", detail: "reads filter by business_id", evidence: "telemetry_serving.py" },
  ],
  not_enforced: [
    { control: "Retrieval-layer RAG ACL", status: "not_applicable", detail: "no document RAG corpus", evidence: "_assemble_evidence" },
    { control: "Runtime RLS enforcement (per-request role / GUC)", status: "not_enforced", detail: "pool uses a privileged role", evidence: "db.py:get_cursor" },
  ],
  tel_table_count: 21,
  rls_enabled_count: 21,
  tenant_policy_count: 21,
  null_reason: null,
};

const AVAILABLE_EVAL: EvalResults = {
  available: true, summary: { passed: 1, total: 1 }, cases: [], generated_at: "2026-06-18T00:00:00Z", source: "pytest",
};

const MCP_TOOLS: McpToolsResponse = {
  tools: [
    { name: "telemetry.read_findings", description: "Read analyzer findings", permission: "read",
      module: "telemetry", tags: ["read"], input_fields: [] },
  ],
  registered: 1, all_read_only: true,
  scope_policy: { denied_reason: "out_of_scope", explanation: "Telemetry-scoped read-only tools only.", scope: ["telemetry"] },
  null_reason: null,
};

function gov(overrides: Partial<GovernanceSummary> = {}): GovernanceSummary {
  return {
    total_interactions: 0, refusal_rate: null, grounded_rate: null, live_llm_rate: null,
    fallback_rate: null, postvalidator_block_count: 0, fallback_reason_breakdown: {},
    tool_call_stats: {}, p50_ms: null, p95_ms: null, answer_source_mix: {},
    null_reason_breakdown: {}, active_prompt_version: "abc123", active_model: "gpt-x",
    allow_list: [], refusal_rule_count: 0, recent_interactions: [], recent_refusals: [],
    unsupported_blocked_examples: [], production_smoke: { status: "pass", checks: [] },
    security_posture: POSTURE, null_reason: null, ...overrides,
  };
}

describe("GovernanceDashboard — Security & access posture", () => {
  it("renders enforced controls and honest non-controls (no overclaim)", async () => {
    getGovernance.mockResolvedValue(gov());
    getEvals.mockResolvedValue(AVAILABLE_EVAL);
    getUsefulness.mockResolvedValue(null);
    getMcpTools.mockResolvedValue(MCP_TOOLS);

    render(<GovernanceDashboard />);

    await waitFor(() => expect(screen.getByText("Security & access posture")).toBeInTheDocument());
    expect(screen.getByText("Enforced controls")).toBeInTheDocument();
    expect(screen.getByText("Not enforced / not applicable")).toBeInTheDocument();
    expect(screen.getByText(/DB-layer RLS \(tel_\* tables\)/)).toBeInTheDocument();
    // the honest boundary is shown, not hidden — proves no "secure RAG" overclaim
    expect(screen.getByText(/Retrieval-layer RAG ACL/)).toBeInTheDocument();
    expect(screen.getByText(/Runtime RLS enforcement/)).toBeInTheDocument();
    // real coverage tag from the posture payload
    expect(screen.getByText(/21\/21 tel_\* RLS/)).toBeInTheDocument();
  });

  it("fails closed when posture is unavailable (never a misleading green)", async () => {
    getGovernance.mockResolvedValue(gov({ security_posture: null }));
    getEvals.mockResolvedValue(AVAILABLE_EVAL);     // keep other panels off the "Not available" path
    getUsefulness.mockResolvedValue(null);
    getMcpTools.mockResolvedValue(MCP_TOOLS);

    render(<GovernanceDashboard />);

    await waitFor(() => expect(screen.getByText("Security & access posture")).toBeInTheDocument());
    expect(screen.getByText("Not available.")).toBeInTheDocument();
    expect(screen.queryByText("Enforced controls")).not.toBeInTheDocument();
  });
});
