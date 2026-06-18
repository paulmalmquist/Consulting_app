import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import HowItWorks from "./HowItWorks";

// The page is static (no API), so no mocks are needed. next/link is aliased to a plain <a href>
// in the vitest config, so href assertions work directly.

describe("HowItWorks — honest architecture exhibit", () => {
  it("renders the status legend (both axes)", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    expect(screen.getByText("How This Works")).toBeInTheDocument();
    expect(screen.getAllByText("Built").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Planned").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Production verified").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Needs live verification/).length).toBeGreaterThan(0);
  });

  it("a Built capability deep-links to a real telemetry route", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    const links = screen.getAllByRole("link", { name: /Model Registry/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((a) => a.getAttribute("href") === "/lab/env/telemetry-demo/telemetry/registry")).toBe(true);
  });

  it("Planned/Blocked rows render 'Not available' and never a fabricated audit/lineage link", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    expect(screen.getAllByText(/Not available/i).length).toBeGreaterThan(0);
    // lineage drawer + metric registry are REPE-only → must not become a telemetry deep-link
    expect(screen.queryByRole("link", { name: /lineage drawer/i })).toBeNull();
  });

  it("names the real medallion tables", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    // these appear in both the architecture map and the medallion trace — both are legitimate
    expect(screen.getAllByText(/tel_stream_readings_bronze/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/tel_stream_minute_agg/).length).toBeGreaterThan(0);
  });

  it("surfaces the known gaps and the MCP registry snapshot", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    expect(screen.getByText(/cost guardrail estimates only/i)).toBeInTheDocument();
    // WRITE_CONFIRMED appears in both the registry snapshot and the tool inventory
    expect(screen.getAllByText(/WRITE_CONFIRMED/).length).toBeGreaterThan(0);
    // honest registry framing, not an overclaim
    expect(screen.getByText(/Telemetry registry UI: Partial/i)).toBeInTheDocument();
  });

  it("does not compute an evidence coverage percentage", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    expect(screen.getByText(/coverage not computed/i)).toBeInTheDocument();
  });
});
