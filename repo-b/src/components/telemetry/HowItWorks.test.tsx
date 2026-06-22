import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

describe("FlowExplorer — interactive scenario trace board", () => {
  it("renders the scenario selector with at least 4 scenarios", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    for (const label of ["Aggregate count answer", "Live freshness / unavailable",
      "Anomaly verdict", "Medallion stream aggregate", "Audited tool call"]) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
  });

  it("carries the 'not a live execution' disclaimer (anti-overclaim guard)", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    expect(screen.getByText("Static trace")).toBeInTheDocument();
    const caption = screen.getByText(/No live call is made/i);
    expect(caption).toHaveTextContent(/nothing here executes/i);
  });

  it("selecting a scenario swaps the trace packet", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    // default = aggregate-count → its trace mentions inventory_counts
    expect(screen.getAllByText(/inventory_counts/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Anomaly verdict/i }));
    expect(screen.getAllByText(/score_window/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/inventory_counts/i)).toBeNull(); // the old scenario's content is gone
  });

  it("shows the real fail-closed reason per scenario (no fabrication)", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    expect(screen.getAllByText(/unsupported_question/i).length).toBeGreaterThan(0); // aggregate default
    fireEvent.click(screen.getByRole("button", { name: /Live freshness/i }));
    expect(screen.getAllByText(/live_data_not_available/i).length).toBeGreaterThan(0);
    // the stale-path honesty note is surfaced, not buried
    expect(screen.getByText(/unit-verified, not production-observed/i)).toBeInTheDocument();
  });

  it("an evidence node deep-links to a real telemetry surface", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    // select the gold-aggregate node in the default scenario's evidence lane
    fireEvent.click(screen.getByRole("button", { name: /Structured fetch/i }));
    const link = screen.getByRole("link", { name: /see live surface/i });
    expect(link).toHaveAttribute("href", "/lab/env/telemetry-demo/telemetry/registry");
  });
});
