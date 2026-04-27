import React from "react";
import { render, screen } from "@testing-library/react";

import SupplyChainSidebar from "./SupplyChainSidebar";

describe("SupplyChainSidebar", () => {
  test("renders all 10 nav sections", () => {
    render(<SupplyChainSidebar envId="11111111-1111-4111-8111-111111111111" />);

    const expected = [
      "Command Center",
      "Architecture",
      "Source Systems",
      "Medallion Pipelines",
      "Data Products",
      "Governance",
      "AI SDLC",
      "Forecasting / ML",
      "Genie / NL BI",
      "Delivery Roadmap",
    ];
    for (const label of expected) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
