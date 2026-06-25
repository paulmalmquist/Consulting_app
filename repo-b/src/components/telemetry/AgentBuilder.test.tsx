import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentGraph,
  AgentRun,
  WorkflowDetail,
  WorkflowSummary,
} from "@/lib/telemetry/agentBuilder-api";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({
    nodes,
    onNodeClick,
    children,
  }: {
    nodes: Array<{ id: string; data: { label: React.ReactNode } }>;
    onNodeClick?: (event: unknown, node: { id: string }) => void;
    children?: React.ReactNode;
  }) => (
    <div data-testid="agent-canvas">
      {nodes.map((node) => (
        <button key={node.id} type="button" onClick={() => onNodeClick?.({}, node)}>
          {node.data.label}
        </button>
      ))}
      {children}
    </div>
  ),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  addEdge: (connection: unknown, edges: unknown[]) => [...edges, connection],
  useNodesState: (initial: unknown[]) => {
    const [value, setValue] = React.useState(initial);
    return [value, setValue, vi.fn()];
  },
  useEdgesState: (initial: unknown[]) => {
    const [value, setValue] = React.useState(initial);
    return [value, setValue, vi.fn()];
  },
}));

const api = vi.hoisted(() => ({
  getPalette: vi.fn(),
  getMcpTools: vi.fn(),
  getWorkflows: vi.fn(),
  getRuns: vi.fn(),
  getWorkflow: vi.fn(),
  createWorkflow: vi.fn(),
  saveWorkflowDraft: vi.fn(),
  validateWorkflow: vi.fn(),
  dryRunWorkflow: vi.fn(),
  getRun: vi.fn(),
  getWorkflowEvals: vi.fn(),
  runWorkflowEvals: vi.fn(),
  stageWorkflow: vi.fn(),
  promoteRunFailure: vi.fn(),
}));

vi.mock("@/lib/telemetry/agentBuilder-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/telemetry/agentBuilder-api")>(
    "@/lib/telemetry/agentBuilder-api",
  );
  return { ...actual, ...api };
});

import AgentBuilder from "./AgentBuilder";

const graph: AgentGraph = {
  schema_version: "agent-graph/v1",
  limits: { max_runtime_seconds: 120, max_tool_calls: 10, max_cost_usd: 1 },
  model_route_policy: { sensitive_fallback: "fail_closed" },
  nodes: [
    { id: "trigger", type: "manual_trigger", label: "Manual Trigger", position: { x: 0, y: 0 }, config: {} },
    { id: "output", type: "output", label: "Output", position: { x: 300, y: 0 }, config: {} },
  ],
  edges: [{ id: "e1", source: "trigger", target: "output", data_type: "control" }],
};

const summary: WorkflowSummary = {
  id: "workflow-1",
  name: "Telemetry Agent",
  description: "Read-only telemetry triage",
  owner_user_id: "operator",
  status: "draft",
  tags: ["template"],
  is_template: true,
  template_key: "telemetry-triage",
  version_id: "version-1",
  version_number: 1,
  validation_status: "pass",
  validation_results: {
    status: "pass",
    checks: { dag: true },
    issues: [],
    topological_order: ["trigger", "output"],
  },
  publish_status: "draft",
  last_run_status: null,
  eval_overall_status: null,
  eval_summary: null,
  updated_at: "2026-06-25T12:00:00Z",
};

const detail: WorkflowDetail = {
  ...summary,
  graph,
  versions: [{
    id: "version-1",
    version_number: 1,
    validation_status: "pass",
    publish_status: "draft",
    publish_blockers: [],
    published_by: null,
    published_at: null,
    created_by: "operator",
    created_at: "2026-06-25T12:00:00Z",
  }],
  published_by: null,
  published_at: null,
  publish_blockers: [],
};

const stagedReadyEval = {
  id: "eval-run-1",
  workflow_id: "workflow-1",
  workflow_version_id: "version-1",
  version_number: 1,
  status: "completed",
  overall_status: "staged_ready" as const,
  summary_json: {
    overall_status: "staged_ready" as const,
    by_class: {
      graph_lint: "pass" as const,
      tool_contract: "pass" as const,
      permission: "pass" as const,
      fail_closed: "pass" as const,
      cost: "pass" as const,
      regression: "pass" as const,
      replay_determinism: "pass" as const,
      rag_grounding: "not_applicable" as const,
      visual_smoke: "not_applicable" as const,
      production_smoke: "not_applicable" as const,
    },
    blockers: [],
    counts: { pass: 7, fail: 0, not_applicable: 3, total: 10 },
  },
  results: [],
};

const blockedEval = {
  ...stagedReadyEval,
  id: undefined,
  status: "not_run",
  overall_status: "blocked" as const,
  summary_json: {
    ...stagedReadyEval.summary_json,
    overall_status: "blocked" as const,
    by_class: {
      ...stagedReadyEval.summary_json.by_class,
      graph_lint: "not_run" as const,
      tool_contract: "not_run" as const,
      permission: "not_run" as const,
      fail_closed: "not_run" as const,
      cost: "not_run" as const,
      regression: "not_run" as const,
      replay_determinism: "not_run" as const,
    },
    blockers: [{ eval_class: "graph_lint", reason: "required_eval_not_run" }],
    counts: { pass: 0, fail: 0, not_applicable: 3, total: 10 },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getPalette.mockResolvedValue({
    schema_version: "agent-graph/v1",
    nodes: [
      { type: "context_loader", label: "Context Loader", category: "Input", description: "Load context" },
      { type: "mcp_tool", label: "MCP Tool", category: "Action", description: "Read tool" },
    ],
  });
  api.getMcpTools.mockResolvedValue({
    tools: [
      {
        name: "telemetry.preview_score_window",
        description: "Preview",
        module: "telemetry",
        permission: "read",
        effective_permission: "read",
        side_effect_class: "read",
        input_schema: {},
        output_schema: {},
        schema_digest: "digest-read",
        enabled: true,
        disabled_reason: null,
      },
      {
        name: "business.create",
        description: "Write",
        module: "business",
        permission: "write",
        effective_permission: "write_confirmed",
        side_effect_class: "write",
        input_schema: {},
        output_schema: null,
        schema_digest: "digest-write",
        enabled: false,
        disabled_reason: "MVP permits read-only MCP tools only",
      },
    ],
  });
  api.getWorkflows.mockResolvedValue({ workflows: [summary] });
  api.getRuns.mockResolvedValue({ runs: [] });
  api.getWorkflow.mockResolvedValue(detail);
  api.getWorkflowEvals.mockResolvedValue(blockedEval);
  api.saveWorkflowDraft.mockResolvedValue({ ...detail, version_number: 2 });
  api.validateWorkflow.mockResolvedValue(detail.validation_results);
  api.dryRunWorkflow.mockResolvedValue({
    id: "run-1",
    workflow_id: "workflow-1",
    workflow_name: "Telemetry Agent",
    workflow_version_id: "version-1",
    version_number: 1,
    status: "succeeded",
    terminal_reason: null,
    started_at: "2026-06-25T12:00:00Z",
    finished_at: "2026-06-25T12:00:01Z",
    actual_cost: 0,
    steps: [
      { id: "step-1", node_id: "trigger", node_type: "manual_trigger", status: "completed", tool_name: null, model_name: null, output_json: {}, error_json: null, receipt_id: "receipt-1" },
      { id: "step-2", node_id: "output", node_type: "output", status: "completed", tool_name: null, model_name: null, output_json: {}, error_json: null, receipt_id: "receipt-2" },
    ],
    receipts: [
      { id: "receipt-1", node_id: "trigger", receipt_type: "step", tools_called: [], model_used: null, terminal_status: "completed", failure_reason: null, created_at: "2026-06-25T12:00:00Z" },
    ],
  } satisfies AgentRun);
  api.runWorkflowEvals.mockResolvedValue(stagedReadyEval);
  api.stageWorkflow.mockResolvedValue({
    ...detail,
    status: "staged",
    publish_status: "staged",
  });
  api.promoteRunFailure.mockResolvedValue({
    source_run_id: "run-1",
    already_promoted: false,
  });
});

describe("AgentBuilder", () => {
  it("adds and configures a node, pins read tools, and saves an immutable draft", async () => {
    const user = userEvent.setup();
    render(<AgentBuilder tab="builder" onOpenBuilder={() => {}} />);
    expect(await screen.findByText("Agent Builder")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Context Loader Input/i }));
    const label = screen.getByLabelText("Label");
    await user.clear(label);
    await user.type(label, "Environment Context");
    await user.click(screen.getByRole("button", { name: "Save Draft" }));

    await waitFor(() => expect(api.saveWorkflowDraft).toHaveBeenCalled());
    const payload = api.saveWorkflowDraft.mock.calls[0][1];
    expect(payload.base_version_number).toBe(1);
    expect(payload.graph.nodes.some((node: { label?: string }) => node.label === "Environment Context")).toBe(true);

    await user.click(screen.getByRole("button", { name: /MCP Tool Action/i }));
    expect(screen.getByRole("option", { name: /business.create · blocked/i })).toBeDisabled();
  });

  it("shows validation, persisted run states, and receipts after dry-run", async () => {
    const user = userEvent.setup();
    render(<AgentBuilder tab="builder" onOpenBuilder={() => {}} />);
    await screen.findByText("Agent Builder");
    await user.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByText("pass")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dry Run" }));
    expect(await screen.findByText(/Run succeeded/i)).toBeInTheDocument();
    expect(screen.getByText(/receipt-1/)).toBeInTheDocument();
    expect(api.dryRunWorkflow).toHaveBeenCalledWith(
      "workflow-1",
      expect.objectContaining({ run_key: "FD001-test-001", channel: "D-4" }),
    );
  });

  it("renders write tools as blocked in the Tool Registry", async () => {
    render(<AgentBuilder tab="tools" onOpenBuilder={() => {}} />);
    expect(await screen.findByText("Tool Registry")).toBeInTheDocument();
    expect(screen.getByText("business.create")).toBeInTheDocument();
    expect(screen.getByText("write · blocked")).toBeInTheDocument();
  });

  it("keeps publish readiness blocked while deferred eval classes are N/A", async () => {
    render(<AgentBuilder tab="evals" onOpenBuilder={() => {}} />);
    expect(await screen.findByText("Publish readiness")).toBeInTheDocument();
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
    expect(screen.getByText("BLOCKED")).toBeInTheDocument();
  });

  it("runs persisted publish-readiness evals", async () => {
    const user = userEvent.setup();
    render(<AgentBuilder tab="evals" onOpenBuilder={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Run Evals" }));
    await waitFor(() => expect(api.runWorkflowEvals).toHaveBeenCalledWith("workflow-1"));
    expect(await screen.findByText("STAGED READY")).toBeInTheDocument();
  });

  it("stages only after deterministic checks pass", async () => {
    const user = userEvent.setup();
    api.getWorkflowEvals.mockResolvedValue(stagedReadyEval);
    render(<AgentBuilder tab="builder" onOpenBuilder={() => {}} />);
    await screen.findByText("Agent Builder");
    const stage = screen.getByRole("button", { name: "Stage" });
    expect(stage).toBeEnabled();
    await user.click(stage);
    await waitFor(() => expect(api.stageWorkflow).toHaveBeenCalledWith("workflow-1"));
  });

  it("promotes a failed run into regression memory", async () => {
    const user = userEvent.setup();
    const failedRun: AgentRun = {
      id: "run-failed",
      workflow_id: "workflow-1",
      workflow_name: "Telemetry Agent",
      workflow_version_id: "version-1",
      version_number: 1,
      status: "not_available",
      terminal_reason: "missing_data",
      started_at: "2026-06-25T12:00:00Z",
      finished_at: "2026-06-25T12:00:01Z",
      actual_cost: 0,
      steps: [],
      receipts: [],
    };
    api.getRuns.mockResolvedValue({ runs: [failedRun] });
    api.getRun.mockResolvedValue(failedRun);
    api.promoteRunFailure.mockResolvedValue({
      source_run_id: "run-failed",
      already_promoted: false,
    });

    render(<AgentBuilder tab="history" onOpenBuilder={() => {}} />);
    await user.click(await screen.findByRole("button", { name: /Telemetry Agent/i }));
    await user.click(await screen.findByRole("button", { name: "Promote failure to regression" }));
    await waitFor(() => expect(api.promoteRunFailure).toHaveBeenCalledWith("run-failed"));
    expect(await screen.findByRole("button", { name: "Promoted to regression" })).toBeDisabled();
  });
});
