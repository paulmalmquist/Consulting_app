import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeatureSetSelector } from "./FeatureSetSelector";
import { getWorkbenchFeatureManifest } from "@/lib/telemetry/api";

vi.mock("@/lib/telemetry/api", () => ({
  getWorkbenchFeatureManifest: vi.fn(),
}));

const MANIFEST = {
  kind: "feature_manifest",
  provider: "local_fixture",
  null_reason: null,
  fallback_used: false,
  payload: {
    feature_sets: [
      { id: "baseline", label: "A — Baseline", purpose: "start", model_family: "rolling-MAD", included: true,
        features: [{ name: "value", calc: "raw", leakage_risk: "none" }], leakage_notes: "ok" },
      { id: "temporal", label: "B — Temporal context", purpose: "drift", model_family: "MAD / PCA", included: false,
        features: [{ name: "residual_slope", calc: "slope", leakage_risk: "none" }], leakage_notes: "trailing" },
      { id: "diagnostic", label: "C — Rich diagnostic state", purpose: "robust", model_family: "PCA / autoencoder", included: false,
        features: [{ name: "cross_channel_aggregate", calc: "agg", leakage_risk: "medium" }], leakage_notes: "audit" },
    ],
  },
};

const mockManifest = getWorkbenchFeatureManifest as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("FeatureSetSelector", () => {
  it("renders A/B/C feature sets with the baseline marked as champion inputs", async () => {
    mockManifest.mockResolvedValue(MANIFEST);
    render(<FeatureSetSelector />);
    expect(await screen.findByText("A — Baseline")).toBeInTheDocument();
    expect(screen.getByText("B — Temporal context")).toBeInTheDocument();
    expect(screen.getByText("C — Rich diagnostic state")).toBeInTheDocument();
    expect(screen.getByText("champion inputs")).toBeInTheDocument();
    // baseline selected by default → its feature row shows
    expect(screen.getByText("value")).toBeInTheDocument();
  });

  it("switches the feature table when another set is selected", async () => {
    mockManifest.mockResolvedValue(MANIFEST);
    render(<FeatureSetSelector />);
    fireEvent.click(await screen.findByText("C — Rich diagnostic state"));
    await waitFor(() => expect(screen.getByText("cross_channel_aggregate")).toBeInTheDocument());
    expect(screen.getByText("medium")).toBeInTheDocument();
  });

  it("fails closed when the manifest receipt is not generated", async () => {
    mockManifest.mockResolvedValue({
      kind: "feature_manifest", provider: null, null_reason: "gcp_receipt_not_generated_yet",
      fallback_used: true, payload: null,
    });
    render(<FeatureSetSelector />);
    expect(await screen.findByText(/not generated yet/i)).toBeInTheDocument();
  });
});
