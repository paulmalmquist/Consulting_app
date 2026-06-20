import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { EnvironmentContractCard } from "../EnvironmentContractCard";

const mockBosFetch = vi.fn();
vi.mock("@/lib/bos-api", () => ({
  bosFetch: (...args: unknown[]) => mockBosFetch(...args),
}));

function report(over: Partial<Record<string, unknown>> = {}) {
  return {
    env_id: "env-1",
    checks: [
      {
        key: "seed.pack_present",
        status: "pass",
        severity: "blocking",
        message: "seed pack 'repe_starter' applied",
      },
      {
        key: "capability.binding_implemented",
        status: "not_available",
        severity: "blocking",
        message: "capability binding not implemented (Phase 3)",
      },
      {
        key: "ai_runtime.eval_suite_declared",
        status: "missing",
        severity: "warning",
        message: "no required_eval_suite declared on contract",
      },
    ],
    blocking_failures: ["capability.binding_implemented"],
    warnings: ["ai_runtime.eval_suite_declared"],
    eligible_for_promotion: false,
    promotion_state: "draft",
    verified_at: "2026-05-19T00:00:00+00:00",
    health_ok: false,
    ...over,
  };
}

describe("EnvironmentContractCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders promotion state badge and the not-promotable banner", async () => {
    mockBosFetch.mockResolvedValue(report());
    render(<EnvironmentContractCard envId="env-1" />);

    expect(await screen.findByTestId("promotion-state-badge")).toHaveTextContent(
      "draft",
    );
    expect(screen.getByTestId("not-eligible-banner")).toBeInTheDocument();
    expect(mockBosFetch).toHaveBeenCalledWith("/v2/environments/env-1/verify");
  });

  test("renders a non-pass check explicitly and never as success", async () => {
    mockBosFetch.mockResolvedValue(report());
    render(<EnvironmentContractCard envId="env-1" />);

    const cap = await screen.findByTestId(
      "check-capability.binding_implemented",
    );
    expect(cap).toHaveTextContent("not_available");
    expect(cap).toHaveTextContent("capability.binding_implemented");
    // The only pass check shows pass; the not_available one must not say pass.
    expect(cap.textContent).not.toMatch(/\bpass\b/);
  });

  test("blocking non-pass checks render before passing checks", async () => {
    mockBosFetch.mockResolvedValue(report());
    render(<EnvironmentContractCard envId="env-1" />);
    await screen.findByTestId("env-contract-card");

    const items = screen.getAllByTestId(/^check-/);
    const order = items.map((el) => el.getAttribute("data-testid"));
    expect(order.indexOf("check-capability.binding_implemented")).toBeLessThan(
      order.indexOf("check-seed.pack_present"),
    );
  });

  test("renders gracefully when every check is missing/not_available", async () => {
    mockBosFetch.mockResolvedValue(
      report({
        checks: [
          {
            key: "ai_runtime.behavior_contract_present",
            status: "missing",
            severity: "blocking",
            message: "no per-env AI behavior contract registry",
          },
          {
            key: "ai_runtime.tools_fail_closed",
            status: "not_available",
            severity: "warning",
            message: "per-env MCP tool set not resolvable",
          },
        ],
        blocking_failures: ["ai_runtime.behavior_contract_present"],
      }),
    );
    render(<EnvironmentContractCard envId="env-1" />);

    expect(await screen.findByTestId("env-contract-card")).toBeInTheDocument();
    expect(screen.getByTestId("not-eligible-banner")).toBeInTheDocument();
    // No false success anywhere.
    expect(screen.queryByText(/\bpass\b/i)).not.toBeInTheDocument();
  });

  test("shows an error surface when verification fails to load", async () => {
    mockBosFetch.mockRejectedValue(new Error("backend unreachable"));
    render(<EnvironmentContractCard envId="env-1" />);

    await waitFor(() =>
      expect(screen.getByTestId("env-contract-card")).toHaveTextContent(
        /Could not load environment contract verification/,
      ),
    );
  });
});
