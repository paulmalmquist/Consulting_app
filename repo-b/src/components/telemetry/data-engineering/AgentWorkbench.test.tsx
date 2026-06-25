import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const getSkillRegistry = vi.fn();
vi.mock("@/lib/automated-data-engineering/api", () => ({
  getSkillRegistry: () => getSkillRegistry(),
}));

import AgentWorkbench from "./AgentWorkbench";

function tool(name: string, over: Record<string, unknown> = {}) {
  return {
    name, module: name.split(".")[0], description: `${name} description`, permission: "read",
    side_effect_class: "read", permission_required: "read", confirmation_required: false,
    lane_tags: [], skill_tags: [], input_fields: [], ...over,
  };
}

const registry = {
  tools: [tool("sql.validate_query"), tool("bm.health_check"), tool("business.create", { side_effect_class: "write", confirmation_required: true })],
  modules: [{ module: "sql", tool_count: 1 }, { module: "bm", tool_count: 1 }, { module: "business", tool_count: 1 }],
  null_reason: null,
};

describe("AgentWorkbench (Phase 2B)", () => {
  beforeEach(() => getSkillRegistry.mockReset());

  it("renders the four-group capability map with mode headers", async () => {
    getSkillRegistry.mockResolvedValue(registry);
    render(<AgentWorkbench envId="env-1" />);
    expect(await screen.findByText(/Observe —/)).toBeInTheDocument();
    expect(screen.getByText(/Propose —/)).toBeInTheDocument();
    expect(screen.getByText(/Execute with guardrails —/)).toBeInTheDocument();
    expect(screen.getByText("Advanced registry")).toBeInTheDocument();
    // The nine curated capabilities appear.
    expect(screen.getByText("Profile source")).toBeInTheDocument();
    expect(screen.getByText("Dry-run SQL")).toBeInTheDocument();
  });

  it("backs dry-run SQL with the real skill but shows declared-only (cannot run) for unbacked capabilities", async () => {
    getSkillRegistry.mockResolvedValue(registry);
    render(<AgentWorkbench envId="env-1" />);
    expect(await screen.findByText("sql.validate_query")).toBeInTheDocument(); // real backing
    // Unbacked capabilities fail closed with the null_reason, never implied runnable.
    expect(screen.getAllByText(/no_registered_skill_for_capability/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Declared capability — cannot run/).length).toBeGreaterThan(0);
  });

  it("keeps the full registry behind the Advanced toggle (opt-in)", async () => {
    getSkillRegistry.mockResolvedValue(registry);
    render(<AgentWorkbench envId="env-1" />);
    await screen.findByText("Advanced registry");
    // Full-registry rows are hidden until toggled.
    expect(screen.queryByText("bm.health_check")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Show full registry/ }));
    expect(await screen.findByText("bm.health_check")).toBeInTheDocument();
  });

  it("fails closed when the registry is unavailable", async () => {
    getSkillRegistry.mockResolvedValue({ tools: [], modules: [], null_reason: "skill_registry_unavailable" });
    render(<AgentWorkbench envId="env-1" />);
    expect(await screen.findByText("Skill registry unavailable")).toBeInTheDocument();
    expect(screen.getByText(/skill_registry_unavailable/)).toBeInTheDocument();
  });
});
