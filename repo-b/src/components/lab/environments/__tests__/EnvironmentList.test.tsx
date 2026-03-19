import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { EnvironmentList } from "@/components/lab/environments/EnvironmentList";
import type { Environment } from "@/components/EnvProvider";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({ uploads_count: 2, tickets_count: 4 }),
}));

const envA: Environment = {
  env_id: "env-1",
  client_name: "Alpha",
  industry: "real_estate",
  industry_type: "real_estate",
  schema_name: "env_alpha",
  is_active: true,
  created_at: "2026-02-19T00:00:00.000Z",
};

const envB: Environment = {
  env_id: "env-2",
  client_name: "Beta",
  industry: "healthcare",
  industry_type: "healthcare",
  schema_name: "env_beta",
  is_active: false,
  created_at: "2026-01-10T00:00:00.000Z",
};

describe("EnvironmentList", () => {
  test("dedupes by env id and logs warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <EnvironmentList
        environments={[envA, envA, envB]}
        onOpen={() => {}}
        onSettings={() => {}}
        onDelete={() => {}}
      />
    );

    const cards = await screen.findAllByTestId(/env-card-/);
    expect(cards).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain("env_list.deduped");
    warn.mockRestore();
  });

  test("search, sort, and filters still work", async () => {
    render(
      <EnvironmentList
        environments={[envA, envB]}
        onOpen={() => {}}
        onSettings={() => {}}
        onDelete={() => {}}
      />
    );

    // Active filter is selected by default, so archived env is hidden.
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();

    // Enable archived filter and verify both.
    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
    expect(await screen.findByText("Beta")).toBeInTheDocument();

    // Search should match industry/schema/name, not env_id.
    fireEvent.change(screen.getByTestId("env-search"), { target: { value: "healthcare" } });
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();

    // Sort control still works.
    fireEvent.change(screen.getByTestId("env-sort"), { target: { value: "name" } });
    expect(screen.getByTestId("env-sort")).toHaveValue("name");
  });

  test("control tower variant preserves controls and exposes the cockpit headers", async () => {
    render(
      <EnvironmentList
        variant="controlTower"
        environments={[envA, envB]}
        onOpen={() => {}}
        onSettings={() => {}}
        onDelete={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Archived" }));

    expect(await screen.findByRole("heading", { name: "Environment Queue" })).toBeInTheDocument();
    expect(screen.getByText("METADATA")).toBeInTheDocument();
    expect(screen.getByText("LAST ACTIVE")).toBeInTheDocument();
    expect(screen.getByText(/Env env-2/i)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("env-search"), { target: { value: "healthcare" } });
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  test("renders a single-column row list with column headers", async () => {
    render(
      <EnvironmentList
        environments={[envA, envB]}
        onOpen={() => {}}
        onSettings={() => {}}
        onDelete={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Archived" }));

    const cards = await screen.findAllByTestId(/env-card-/);
    expect(cards).toHaveLength(2);
    expect(screen.getByTestId("env-list")).toHaveClass("flex");
    expect(screen.getByText("STATUS")).toBeInTheDocument();
    expect(screen.getByText("ENVIRONMENT")).toBeInTheDocument();
  });
});
