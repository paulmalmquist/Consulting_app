import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const getSkillRegistry = vi.fn();
vi.mock("@/lib/automated-data-engineering/api", () => ({
  getSkillRegistry: () => getSkillRegistry(),
}));

import WorkflowTemplates from "./WorkflowTemplates";

function tool(name: string) {
  return {
    name, module: name.split(".")[0], description: name, permission: "read",
    side_effect_class: "read", permission_required: "read", confirmation_required: false,
    lane_tags: [], skill_tags: [], input_fields: [],
  };
}

describe("WorkflowTemplates (Phase 2C)", () => {
  beforeEach(() => getSkillRegistry.mockReset());

  it("renders the named templates with steps and tests (no fake runs)", async () => {
    getSkillRegistry.mockResolvedValue({ tools: [tool("sql.validate_query")], modules: [], null_reason: null });
    render(<WorkflowTemplates envId="env-1" />);
    expect(await screen.findByText("Ingest new telemetry source")).toBeInTheDocument();
    expect(screen.getByText("Add governed metric")).toBeInTheDocument();
    expect(screen.getByText("Add NCR clustering source")).toBeInTheDocument();
    // No execution affordance / no receipt fabrication — read-only banner present.
    expect(screen.getByText(/No workflow executes from this surface/)).toBeInTheDocument();
  });

  it("shows blocked executability with a reason when steps lack a backing skill", async () => {
    getSkillRegistry.mockResolvedValue({ tools: [tool("sql.validate_query")], modules: [], null_reason: null });
    render(<WorkflowTemplates envId="env-1" />);
    await screen.findByText("Ingest new telemetry source");
    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/No registered governed skill/).length).toBeGreaterThan(0);
  });

  it("fails closed to 'Unavailable' executability when the registry read fails", async () => {
    getSkillRegistry.mockResolvedValue({ tools: [], modules: [], null_reason: "workflow_read_unavailable" });
    render(<WorkflowTemplates envId="env-1" />);
    await screen.findByText("Add governed metric");
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
  });
});
