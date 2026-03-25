import React from "react";
import { render, screen } from "@testing-library/react";
import { KpiStrip } from "./KpiStrip";

describe("KpiStrip", () => {
  test("keeps the default variant unchanged", () => {
    const { container } = render(
      <KpiStrip
        kpis={[
          {
            label: "Portfolio NAV",
            value: "$1.4B",
            delta: { value: "+2.0%", tone: "positive" },
          },
        ]}
      />
    );

    expect(screen.getByText("Portfolio NAV")).toBeInTheDocument();
    expect(screen.getByText("$1.4B")).toHaveClass("text-lg");
    expect(screen.getByText("+2.0%")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("flex");
  });

  test("renders the band variant as a divider-led metric strip", () => {
    const { container } = render(
      <KpiStrip
        variant="band"
        kpis={[
          { label: "Funds", value: "3" },
          { label: "Active Assets", value: "33" },
          { label: "Portfolio NAV", value: "$1.4B" },
        ]}
      />
    );

    expect(container.firstChild).toHaveClass("grid");
    expect(screen.getByText("Funds")).toBeInTheDocument();
    expect(screen.getByText("3")).toHaveClass("text-[26px]");
    expect(screen.getByText("Portfolio NAV")).toBeInTheDocument();
  });
});
