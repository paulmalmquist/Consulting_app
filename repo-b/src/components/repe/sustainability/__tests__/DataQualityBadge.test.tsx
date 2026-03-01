import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataQualityBadge } from "@/components/repe/sustainability/DataQualityBadge";

describe("DataQualityBadge", () => {
  it("renders the complete state", () => {
    render(<DataQualityBadge status="complete" />);
    expect(screen.getByTestId("sus-data-quality-badge")).toHaveTextContent("Data Quality: Complete");
  });

  it("renders the review fallback state", () => {
    render(<DataQualityBadge status="review" />);
    expect(screen.getByTestId("sus-data-quality-badge")).toHaveTextContent("Data Quality: Review");
  });

  it("renders the blocked state", () => {
    render(<DataQualityBadge status="blocked" />);
    expect(screen.getByTestId("sus-data-quality-badge")).toHaveTextContent("Data Quality: Blocked");
  });
});
