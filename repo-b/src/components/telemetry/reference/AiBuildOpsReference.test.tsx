import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import AiBuildOpsReference from "./AiBuildOpsReference";
import { SECTIONS } from "./manifest";

describe("AiBuildOpsReference — telemetry build & operations reference", () => {
  it("renders the document title", () => {
    render(<AiBuildOpsReference envId="telemetry-demo" />);
    expect(
      screen.getByRole("heading", { name: "AI Build & Operations Reference", level: 1 }),
    ).toBeInTheDocument();
  });

  it("anchors all eleven numbered sections", () => {
    const { container } = render(<AiBuildOpsReference envId="telemetry-demo" />);
    expect(SECTIONS).toHaveLength(11);
    for (const s of SECTIONS) {
      expect(container.querySelector(`#${s.id}`)).not.toBeNull();
    }
  });

  it("surfaces real, verifiable facts (not vendor copy)", () => {
    const { container } = render(<AiBuildOpsReference envId="telemetry-demo" />);
    const text = container.textContent ?? "";
    // a real MCP tool, a real endpoint, a real CI gate, and an honest-boundary phrase
    expect(text).toContain("telemetry.get_triggering_prediction");
    expect(text).toContain("/api/telemetry/summary");
    expect(text).toContain("frontend-quality");
    expect(text).toContain("MAD stayed champion");
  });

  it("renders a table of contents linking each section", () => {
    render(<AiBuildOpsReference envId="telemetry-demo" />);
    const toc = screen.getByRole("navigation", { name: "On this page" });
    for (const s of SECTIONS) {
      // anchor hrefs in the TOC point at each section id
      expect(toc.querySelector(`a[href="#${s.id}"]`)).not.toBeNull();
    }
  });
});
