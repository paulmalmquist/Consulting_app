import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
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

vi.mock("@/lib/telemetry/controlTower-api", () => ({
  listDecisions: vi.fn(async () => ({ decisions: [] })),
  getGemmaState: vi.fn(async () => ({
    status: "cold",
    confirm_tokens: { warm: "", teardown: "" },
    lifecycle_enabled: false,
  })),
  scoreAndGate: vi.fn(),
  resolveDecision: vi.fn(),
  probeGemma: vi.fn(),
  warmGemma: vi.fn(),
  teardownGemma: vi.fn(),
  verifyReceipt: vi.fn(),
}));

vi.mock("@/lib/telemetry/agentBuilder-api", () => ({
  getPalette: vi.fn(async () => ({ schema_version: "agent-graph/v1", nodes: [] })),
  getMcpTools: vi.fn(async () => ({ tools: [] })),
  getWorkflows: vi.fn(async () => ({ workflows: [] })),
  getRuns: vi.fn(async () => ({ runs: [] })),
  getWorkflow: vi.fn(),
  createWorkflow: vi.fn(),
  saveWorkflowDraft: vi.fn(),
  validateWorkflow: vi.fn(),
  dryRunWorkflow: vi.fn(),
  getRun: vi.fn(),
}));

import ControlTower from "./ControlTower";

describe("ControlTower tabs", () => {
  it("preserves the Run Console and exposes all six governed modes", async () => {
    const user = userEvent.setup();
    render(<ControlTower />);
    const labels = ["Run Console", "Agent Builder", "Agent Registry", "Run History", "Tool Registry", "Evals"];
    for (const label of labels) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
    expect(await screen.findByText("Run go/no-go")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Agent Registry" }));
    expect(await screen.findByRole("heading", { name: "Agent Registry" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Evals" }));
    expect(await screen.findByText("Publish readiness")).toBeInTheDocument();
  });
});
