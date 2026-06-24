import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DataCollectionCard from "./DataCollectionCard";

describe("DataCollectionCard", () => {
  it("renders the data-type -> action methodology and labels itself a framework, not live metrics", () => {
    render(<DataCollectionCard />);
    expect(screen.getByText(/What modern launch operations actually run on/i)).toBeInTheDocument();
    // explicitly framed as methodology, not live values (no overclaim)
    expect(screen.getByText(/Framework, not live metrics/i)).toBeInTheDocument();
    // a representative data type and the action it changes
    expect(screen.getByText(/Telemetry streams/i)).toBeInTheDocument();
    expect(screen.getByText(/Model predictions/i)).toBeInTheDocument();
    expect(screen.getByText(/launch-readiness margin/i)).toBeInTheDocument();
  });
});
