import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// Stub the two embedded sub-surfaces; this test verifies SystemHealth composes them under one
// heading + section dividers (the data-backed behavior of each is covered by their own contracts).
vi.mock("./Monitoring", () => ({ default: () => <div data-testid="monitoring-embed">monitoring</div> }));
vi.mock("./SpikeInspector", () => ({ default: () => <div data-testid="spike-embed">spike</div> }));

import SystemHealth from "./SystemHealth";

describe("SystemHealth — consolidated operations view", () => {
  it("renders one System Health heading and embeds both operational sub-surfaces under sections", () => {
    render(<SystemHealth envId="env-1" />);
    expect(screen.getByText("System Health")).toBeInTheDocument();
    expect(screen.getByText(/drift, serving, stream health/i)).toBeInTheDocument();
    expect(screen.getByText(/analyzer dispositions/i)).toBeInTheDocument();
    expect(screen.getByTestId("monitoring-embed")).toBeInTheDocument();
    expect(screen.getByTestId("spike-embed")).toBeInTheDocument();
  });
});
