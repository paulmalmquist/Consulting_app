import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TelemetryPageHeader } from "./TelemetryPageHeader";

describe("TelemetryPageHeader", () => {
  it("renders eyebrow, a single H1 from segmented title, and description", () => {
    render(
      <TelemetryPageHeader
        variant="hero"
        eyebrow="Overview"
        title={[{ text: "Why " }, { text: "Launch", gradient: true }, { text: " Became A " }, { text: "Data", gradient: true }, { text: " Problem" }]}
        description="A thesis sentence."
      />
    );
    expect(screen.getByText("Overview")).toBeInTheDocument();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Why Launch Became A Data Problem");
    expect(screen.getByText("A thesis sentence.")).toBeInTheDocument();
  });

  it("accepts a plain string title", () => {
    render(<TelemetryPageHeader variant="standard" eyebrow="Model Evidence" title="Can you trust this model?" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Can you trust this model?");
  });

  it("renders the hero metric row with values and accents", () => {
    render(
      <TelemetryPageHeader
        variant="hero"
        eyebrow="Overview"
        title="T"
        metrics={[{ label: "First orbit", value: "1957 – 2026", sub: "since" }, { label: "Cost", value: "$12k" }]}
      />
    );
    expect(screen.getByText("First orbit")).toBeInTheDocument();
    expect(screen.getByText("1957 – 2026")).toBeInTheDocument();
    expect(screen.getByText("$12k")).toBeInTheDocument();
  });

  it("renders actions and metadata slots when provided", () => {
    render(
      <TelemetryPageHeader
        variant="compact"
        eyebrow="Stargate Live"
        title="Printer telemetry stream"
        actions={<button type="button">Start</button>}
        metadata={<span>recorded capture</span>}
      />
    );
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByText("recorded capture")).toBeInTheDocument();
  });
});
