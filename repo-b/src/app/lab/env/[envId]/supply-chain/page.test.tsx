import React from "react";
import { render, screen } from "@testing-library/react";

import SupplyChainHomePage from "@/app/lab/env/[envId]/supply-chain/page";

describe("Supply Chain Command Center", () => {
  test("renders headline and seeded content", () => {
    render(<SupplyChainHomePage />);

    expect(screen.getByText("Supply Chain Data Platform")).toBeInTheDocument();
    expect(screen.getByText("Platform Maturity")).toBeInTheDocument();
    expect(screen.getByText("Source Coverage")).toBeInTheDocument();
    expect(screen.getByText("Data Quality")).toBeInTheDocument();
  });

  test("surfaces open risks with believable specifics", () => {
    render(<SupplyChainHomePage />);

    expect(
      screen.getByText(/Manhattan WMS CDC lag/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Two suppliers missing freight tenders/i)
    ).toBeInTheDocument();
  });
});
