import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import FeatureContractCard from "./FeatureContractCard";
import type { FusedVectorInfo } from "@/lib/telemetry/api";

const { getFusedVectorInfo } = vi.hoisted(() => ({ getFusedVectorInfo: vi.fn() }));

vi.mock("@/lib/telemetry/api", () => ({
  getFusedVectorInfo,
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "7e1eb000-0000-4000-a000-000000000001",
}));

const realInfo: FusedVectorInfo = {
  available: true,
  vector_dim: 256,
  n_channels: 32,
  features_per_channel: 8,
  feature_names: ["mean", "std", "min", "max", "slope", "rmean", "zscore", "psi"],
  channels: ["A-1", "D-4"],
  d4_included: true,
  fused_vectors: 1200,
  anomalous_test_vectors: 37,
  model: "tel_anomaly_detector",
  alignment: "tick-aligned",
  source: "tel_fused_state_v1",
};

describe("FeatureContractCard fail-closed", () => {
  it("renders an empty state with the null_reason when unavailable", async () => {
    getFusedVectorInfo.mockResolvedValueOnce({
      available: false, null_reason: "fused_vector_table_empty",
    } satisfies FusedVectorInfo);
    render(<FeatureContractCard />);
    await waitFor(() =>
      expect(screen.getByText(/fused_vector_table_empty/)).toBeInTheDocument());
  });

  it("renders an error state when the fetch rejects", async () => {
    getFusedVectorInfo.mockRejectedValueOnce(new Error("boom"));
    render(<FeatureContractCard />);
    await waitFor(() =>
      expect(screen.getByText(/Could not load:/)).toBeInTheDocument());
  });
});

describe("FeatureContractCard real data", () => {
  it("renders the vector dimension, a feature name, and the point-in-time control", async () => {
    getFusedVectorInfo.mockResolvedValueOnce(realInfo);
    render(<FeatureContractCard />);
    await waitFor(() => expect(screen.getByText("256")).toBeInTheDocument());
    expect(screen.getByText("32 × 8")).toBeInTheDocument();
    expect(screen.getByText("slope")).toBeInTheDocument();
    expect(screen.getByText(/Point-in-time control: enforced/)).toBeInTheDocument();
    expect(screen.getAllByText("tel_fused_state_v1").length).toBeGreaterThan(0);
  });
});
