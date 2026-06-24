import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import HowItWorks from "./HowItWorks";

// The page is static (no API). next/link is aliased to a plain <a href> in the vitest config, so
// href assertions work directly. jsdom has no layout, so stub the SVG geometry/pointer methods the
// pan/zoom map calls during render and interaction.
beforeAll(() => {
  if (!(SVGElement.prototype as unknown as { setPointerCapture?: unknown }).setPointerCapture) {
    (SVGElement.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
    (SVGElement.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
  }
});

describe("HowItWorks — telemetry system-architecture exhibit", () => {
  it("renders the heading and the four view tabs", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    expect(screen.getByText("Winston Telemetry Platform")).toBeInTheDocument();
    for (const label of ["Master System", "NASA · Databricks ML", "Streaming", "Factory ML · NCR"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("renders the status legend and the serving-tech legend", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    expect(screen.getByText("REAL · LIVE")).toBeInTheDocument();
    expect(screen.getByText("OPTIONAL · FAILS CLOSED")).toBeInTheDocument();
    expect(screen.getByText("PLANNED / NOT IMPLEMENTED")).toBeInTheDocument();
    // tech legend names
    expect(screen.getByText("Databricks")).toBeInTheDocument();
    expect(screen.getByText("Confluent / Kafka")).toBeInTheDocument();
  });

  it("clicking a node opens the drawer with its plain-English story and a live deep-link", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    // The master view's serving node carries a real story + a model-performance slug.
    // Nodes render their label as SVG text; find one and click its group.
    const labelEl = screen.getAllByText(/Supabase tel_predictions/)[0];
    fireEvent.click(labelEl);
    // drawer surfaces the plain story and a live-surface link to the real route
    expect(screen.getByText(/copied into the live database/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /see live surface/i });
    expect(link).toHaveAttribute("href", "/lab/env/telemetry-demo/telemetry/model-performance");
  });

  it("switching tabs swaps the rendered view content", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    expect(screen.getByText(/full system map/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Streaming" }));
    expect(screen.getByText(/ISS \+ Stargate streaming/i)).toBeInTheDocument();
  });

  it("surfaces the consolidated known-limitations list", () => {
    render(<HowItWorks envId="telemetry-demo" />);
    const panel = screen.getByText("Known limitations").closest("div")!;
    expect(within(panel.parentElement as HTMLElement).getByText(/N-CMAPSS is planned and not downloaded/i)).toBeInTheDocument();
  });
});
