import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AiEvidenceCard from "./AiEvidenceCard";
import { askCopilot } from "@/lib/telemetry/copilot-api";
import type { CopilotResponse } from "@/lib/telemetry/copilot-api";

// Mock the copilot API module — the card must render ONLY what the API returns.
vi.mock("@/lib/telemetry/copilot-api", () => ({
  askCopilot: vi.fn(),
}));

const askCopilotMock = vi.mocked(askCopilot);

const groundedResponse: CopilotResponse = {
  answer: "There are 4096 predictions and 12 test runs in the telemetry inventory.",
  evidence: [
    { type: "kpi", id: "predictions", label: "Predictions logged", value: 4096, metadata: {} },
    { type: "kpi", id: "test_runs", label: "Test runs", value: 12, metadata: {} },
  ],
  tool_trace: [
    {
      tool_name: "telemetry.get_summary",
      status: "success",
      args: {},
      result_summary: "returned inventory KPIs",
      duration_ms: 42,
    },
  ],
  null_reason: null,
  is_refusal: false,
  intent: "inventory_count",
  answer_source: "live_llm",
  prompt_version: "v7",
  model: "gpt-5-mini",
  draft_report_md: null,
  request_id: "req_grounded_1",
};

const refusalResponse: CopilotResponse = {
  answer: "I can only answer questions about the telemetry inventory and model evidence.",
  evidence: [],
  tool_trace: [],
  null_reason: "out_of_scope",
  is_refusal: true,
  intent: "out_of_scope",
  answer_source: "refusal",
  prompt_version: "v7",
  model: "gpt-5-mini",
  draft_report_md: null,
  request_id: "req_refusal_1",
};

beforeEach(() => {
  askCopilotMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AiEvidenceCard", () => {
  it("shows an idle hint before the script runs", () => {
    render(<AiEvidenceCard />);
    expect(screen.getByText("Script idle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run ai evidence script/i })).toBeInTheDocument();
  });

  it("renders the grounded answer + cited evidence and a refusal tag after running", async () => {
    askCopilotMock.mockResolvedValueOnce(groundedResponse).mockResolvedValueOnce(refusalResponse);

    render(<AiEvidenceCard />);
    fireEvent.click(screen.getByRole("button", { name: /run ai evidence script/i }));

    // Grounded answer text + a cited evidence label appear.
    await waitFor(() =>
      expect(
        screen.getByText(/4096 predictions and 12 test runs/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Predictions logged")).toBeInTheDocument();

    // The out-of-scope question is refused.
    await waitFor(() => expect(screen.getByText("refused")).toBeInTheDocument());

    // Both fixed questions were asked.
    expect(askCopilotMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed to an error state when the copilot API rejects", async () => {
    askCopilotMock.mockRejectedValue(new Error("backend route unavailable"));

    render(<AiEvidenceCard />);
    fireEvent.click(screen.getByRole("button", { name: /run ai evidence script/i }));

    await waitFor(() =>
      expect(screen.getAllByText(/could not load:/i).length).toBeGreaterThan(0),
    );
  });
});
