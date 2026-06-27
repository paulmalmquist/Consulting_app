import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChampionReviewPanel } from "./ChampionReviewPanel";
import { getModelPerformance, getWorkbenchPromotionReview } from "@/lib/telemetry/api";

vi.mock("@/lib/telemetry/api", () => ({
  getModelPerformance: vi.fn(),
  getWorkbenchPromotionReview: vi.fn(),
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "7e1eb000-0000-4000-a000-000000000001",
}));
const mockModels = getModelPerformance as ReturnType<typeof vi.fn>;
const mockReview = getWorkbenchPromotionReview as ReturnType<typeof vi.fn>;

const MODELS = [
  { model_name: "tel_anomaly_mad", model_kind: "anomaly", model_version: "3", model_alias: "champion",
    mlflow_run_id: "r1", experiment_id: "e1", promotion_state: "promoted",
    metrics: { alarm_precision: 0.33, event_recall: 0.77, f1_pointwise: 0.31, precision: 0.33 }, gate: {} },
  { model_name: "tel_anomaly_pca", model_kind: "anomaly", model_version: "2", model_alias: null,
    mlflow_run_id: "r2", experiment_id: "e1", promotion_state: "baseline",
    metrics: { alarm_precision: 0.20, event_recall: 0.28, f1_pointwise: 0.42, precision: 0.87 }, gate: {} },
];

beforeEach(() => vi.clearAllMocks());

describe("ChampionReviewPanel", () => {
  it("renders the canonical narrative and champion/challenger from live rows", async () => {
    mockModels.mockResolvedValue({ models: MODELS, null_reason: null });
    mockReview.mockResolvedValue({ kind: "promotion_review", provider: null, null_reason: "gcp_receipt_not_generated_yet", fallback_used: true, payload: null });
    render(<ChampionReviewPanel />);
    expect(await screen.findByText("MAD stayed champion.")).toBeInTheDocument();
    expect(screen.getByText("PCA looked smarter.")).toBeInTheDocument();
    expect(screen.getByText("tel_anomaly_mad")).toBeInTheDocument();
    expect(screen.getByText("tel_anomaly_pca")).toBeInTheDocument();
    expect(screen.getByText("champion")).toBeInTheDocument();
    expect(screen.getByText("challenger")).toBeInTheDocument();
  });

  it("renders the gate table when the promotion_review receipt has landed", async () => {
    mockModels.mockResolvedValue({ models: MODELS, null_reason: null });
    mockReview.mockResolvedValue({
      kind: "promotion_review", provider: "vertex", null_reason: null, fallback_used: false,
      payload: {
        decision: "model_not_promoted", reason_rejected: "challenger improved recall but degraded alarm precision",
        gates: [{ name: "alarm_precision", champion: 0.33, challenger: 0.20, verdict: "fail" }],
      },
    });
    render(<ChampionReviewPanel />);
    expect(await screen.findByText("alarm_precision")).toBeInTheDocument();
    expect(screen.getByText(/degraded alarm precision/i)).toBeInTheDocument();
  });
});
