import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CapabilityUnavailable from "./CapabilityUnavailable";

describe("CapabilityUnavailable", () => {
  it("renders title + default fail-loud body", () => {
    render(<CapabilityUnavailable capabilityKey="repe.waterfall" title="Waterfall Engine" />);
    expect(screen.getByTestId("capability-unavailable")).toBeInTheDocument();
    expect(screen.getByText("Waterfall Engine")).toBeInTheDocument();
    expect(
      screen.getByText(/Not available in the current environment/i),
    ).toBeInTheDocument();
    expect(screen.getByText("repe.waterfall")).toBeInTheDocument();
    expect(screen.getByText(/Contact admin to enable/i)).toBeInTheDocument();
  });

  it("exposes capability key as data attribute for telemetry", () => {
    render(<CapabilityUnavailable capabilityKey="credit.portfolio" title="Portfolio" />);
    const el = screen.getByTestId("capability-unavailable");
    expect(el.getAttribute("data-capability-key")).toBe("credit.portfolio");
  });

  it("renders optional moduleLabel + note + custom adminHint", () => {
    render(
      <CapabilityUnavailable
        capabilityKey="pds.exec"
        title="Executive Dashboard"
        moduleLabel="PDS Reporting"
        note="Requires the Q2 close to be sealed before metrics populate."
        adminHint="Open a request in #pds-ops."
      />,
    );
    expect(screen.getByText("PDS Reporting")).toBeInTheDocument();
    expect(
      screen.getByText(/Q2 close to be sealed/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Open a request in #pds-ops.")).toBeInTheDocument();
  });
});
