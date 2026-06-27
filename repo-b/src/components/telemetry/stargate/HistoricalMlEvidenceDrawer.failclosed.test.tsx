import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Drawer-level fail-closed: when the evidence artifact is missing its required blocks
// (model_card / metrics / source), the drawer renders an explicit not-available message
// instead of any fabricated values.
vi.mock("@/lib/telemetry/regimeAnomalyEvidence.json", () => ({ default: {} }));

import HistoricalMlEvidenceDrawer from "./HistoricalMlEvidenceDrawer";

describe("HistoricalMlEvidenceDrawer — fail-closed when the artifact is incomplete", () => {
  it("shows an explicit missing-fields message and no fabricated metrics", () => {
    render(<HistoricalMlEvidenceDrawer open onClose={() => {}} />);
    expect(screen.getByText(/missing required fields/i)).toBeInTheDocument();
    expect(screen.queryByText(/93\.3% mean/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Open silver_cmapss/i })).toBeNull();
  });
});
