import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VerdictChip, TelemetryActionButton, TelemetryStatusBanner, MetricRow, InlineCode,
  TelemetrySection, SectionTabButton,
} from "./primitives";

describe("VerdictChip", () => {
  it("renders NO_GO as NO-GO", () => {
    render(<VerdictChip verdict="NO_GO" />);
    expect(screen.getByText("NO-GO")).toBeInTheDocument();
  });
  it("renders GO verbatim and a dash for missing verdicts", () => {
    const { rerender } = render(<VerdictChip verdict="GO" />);
    expect(screen.getByText("GO")).toBeInTheDocument();
    rerender(<VerdictChip verdict={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("TelemetryActionButton", () => {
  it("is a real button that fires onClick and respects disabled", () => {
    const onClick = vi.fn();
    const { rerender } = render(<TelemetryActionButton onClick={onClick}>Replay</TelemetryActionButton>);
    const btn = screen.getByRole("button", { name: "Replay" });
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<TelemetryActionButton onClick={onClick} disabled>Replay</TelemetryActionButton>);
    screen.getByRole("button", { name: "Replay" }).click();
    expect(onClick).toHaveBeenCalledTimes(1); // disabled → no further calls
  });
});

describe("TelemetryStatusBanner", () => {
  it("uses role=alert for the error tone and role=status otherwise", () => {
    const { rerender } = render(<TelemetryStatusBanner tone="error">down</TelemetryStatusBanner>);
    expect(screen.getByRole("alert")).toHaveTextContent("down");
    rerender(<TelemetryStatusBanner tone="warn">heads up</TelemetryStatusBanner>);
    expect(screen.getByRole("status")).toHaveTextContent("heads up");
  });
});

describe("MetricRow / InlineCode / sections", () => {
  it("renders label and value", () => {
    render(<MetricRow label="MLflow run" value="abc123" />);
    expect(screen.getByText("MLflow run")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });
  it("InlineCode renders its children", () => {
    render(<InlineCode>no_upstream_edges_in_catalog</InlineCode>);
    expect(screen.getByText("no_upstream_edges_in_catalog")).toBeInTheDocument();
  });
  it("TelemetrySection renders its label and children", () => {
    render(<TelemetrySection label="Posture"><span>body</span></TelemetrySection>);
    expect(screen.getByText("Posture")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });
  it("SectionTabButton reflects active via aria-pressed", () => {
    render(<SectionTabButton active onClick={() => {}}>Map</SectionTabButton>);
    expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true");
  });
});
