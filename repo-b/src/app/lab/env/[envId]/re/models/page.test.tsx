import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReModelsPage from "@/app/lab/env/[envId]/re/models/page";

const mockListReV1Funds = vi.fn();
const mockListAllModels = vi.fn();
const mockCreateCrossFundModel = vi.fn();
const mockLocationAssign = vi.fn();

vi.mock("@/components/repe/workspace/ReEnvProvider", () => ({
  useReEnv: () => ({
    envId: "env-1",
    businessId: "biz-1",
  }),
}));

vi.mock("@/lib/repe-context", () => ({
  useRepeBasePath: () => "/lab/env/env-1/re",
}));

vi.mock("@/lib/bos-api", () => ({
  listReV1Funds: (...args: unknown[]) => mockListReV1Funds(...args),
  listAllModels: (...args: unknown[]) => mockListAllModels(...args),
  createCrossFundModel: (...args: unknown[]) => mockCreateCrossFundModel(...args),
}));

describe("RE models page create flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock window.location.assign since jsdom doesn't support navigation
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign: mockLocationAssign },
      writable: true,
    });

    mockListReV1Funds.mockResolvedValue([
      {
        fund_id: "fund-1",
        business_id: "biz-1",
        name: "Paul Test Fund",
        vintage_year: 2025,
        fund_type: "closed_end",
        strategy: "equity",
        status: "investing",
        base_currency: "USD",
        quarter_cadence: "quarterly",
        created_at: "2026-03-01T00:00:00Z",
      },
    ]);

    mockListAllModels.mockResolvedValue([]);

    mockCreateCrossFundModel.mockResolvedValue({
      model_id: "model-1",
      primary_fund_id: "fund-1",
      env_id: "env-1",
      name: "New Model",
      description: "Underwritten base case",
      status: "draft",
      model_type: "forecast",
      strategy_type: "credit",
      created_at: "2026-03-15T13:00:00Z",
    });
  });

  test("creates a model and navigates to the detail page", async () => {
    const user = userEvent.setup();

    render(<ReModelsPage />);

    await screen.findByText("No models yet. Create one below.");

    await user.type(screen.getByTestId("model-name-input"), "New Model");
    await user.type(screen.getByTestId("model-desc-input"), "Underwritten base case");
    await user.selectOptions(screen.getByTestId("model-type-select"), "forecast");
    await user.selectOptions(screen.getByTestId("model-strategy-select"), "credit");
    await user.selectOptions(screen.getByTestId("model-fund-select"), "fund-1");
    await user.click(screen.getByTestId("create-model-btn"));

    await waitFor(() => {
      expect(mockCreateCrossFundModel).toHaveBeenCalledWith({
        env_id: "env-1",
        primary_fund_id: "fund-1",
        name: "New Model",
        description: "Underwritten base case",
        model_type: "forecast",
        strategy_type: "credit",
      });
    });

    // Page navigates to the new model detail after creation
    await waitFor(() => {
      expect(mockLocationAssign).toHaveBeenCalledWith("/lab/env/env-1/re/models/model-1");
    });
  });

  test("shows an inline validation error when the model name is blank", async () => {
    const user = userEvent.setup();

    render(<ReModelsPage />);

    await screen.findByText("No models yet. Create one below.");
    await user.click(screen.getByTestId("create-model-btn"));

    expect(await screen.findByText("Model name is required.")).toBeInTheDocument();
    expect(mockCreateCrossFundModel).not.toHaveBeenCalled();
  });

  test("surfaces the no-funds state and disables create", async () => {
    mockListReV1Funds.mockResolvedValueOnce([]);

    render(<ReModelsPage />);

    expect(await screen.findByText("No funds are available in this environment. Create a fund before creating a model.")).toBeInTheDocument();
    expect(screen.getByTestId("create-model-btn")).toBeDisabled();
  });
});
