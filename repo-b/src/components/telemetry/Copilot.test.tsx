import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DispositionControls } from "./Copilot";

const { recordDisposition } = vi.hoisted(() => ({
  recordDisposition: vi.fn(async (_id: string, body?: Record<string, unknown>) => ({
    action_id: "a-1",
    arm: (body?.arm as string) ?? "assisted",
    is_override: body?.human_verdict !== "NO_GO",
    null_reason: null,
  })),
}));

vi.mock("@/lib/telemetry/copilot-api", () => ({
  // DispositionControls only uses recordDisposition; the rest of Copilot.tsx's imports are stubbed.
  recordDisposition,
  askCopilot: vi.fn(), explainVerdict: vi.fn(), getGovernance: vi.fn(), draftReport: vi.fn(),
}));

describe("DispositionControls (Track B review capture — regression for the unresponsive Start button)", () => {
  beforeEach(() => recordDisposition.mockClear());

  function mount(modelVerdict: string | null = "NO_GO") {
    return render(
      <DispositionControls reportId="r-1" modelVerdict={modelVerdict} fireTick={728} evidenceOpened={2} />,
    );
  }

  it("Start button is enabled at mount (assisted default) and flips to timing…", () => {
    mount();
    const start = screen.getByTestId("disposition-start");
    expect(start).not.toBeDisabled();
    fireEvent.click(start);
    expect(start).toHaveTextContent("timing…");
    expect(start).toBeDisabled();
  });

  it("clicking a verdict BEFORE the timer shows a visible error, never a silent no-op", () => {
    mount();
    fireEvent.click(screen.getByTestId("disposition-verdict-agree-no-go"));
    expect(screen.getByText(/Start the timer first/i)).toBeInTheDocument();
    expect(recordDisposition).not.toHaveBeenCalled();
  });

  it("assisted flow: start → verdict submits a measured time_to_verdict_ms with the arm + evidence count", async () => {
    mount();
    fireEvent.click(screen.getByTestId("disposition-start"));
    fireEvent.click(screen.getByTestId("disposition-verdict-agree-no-go"));
    await waitFor(() => expect(recordDisposition).toHaveBeenCalledTimes(1));
    const body = recordDisposition.mock.calls[0][1]!;
    expect(body.arm).toBe("assisted");
    expect(body.human_verdict).toBe("NO_GO");
    expect(typeof body.time_to_verdict_ms).toBe("number");
    expect(body.time_to_verdict_ms as number).toBeGreaterThanOrEqual(0);
    expect(body.evidence_opened).toBe(2);
    await waitFor(() => expect(screen.getByText(/Recorded \(assisted/)).toBeInTheDocument());
  });

  it("unassisted arm records evidence_opened=0 even when cards were opened", async () => {
    mount();
    fireEvent.click(screen.getByTestId("disposition-arm-unassisted"));
    fireEvent.click(screen.getByTestId("disposition-start"));
    fireEvent.click(screen.getByTestId("disposition-verdict-defer"));
    await waitFor(() => expect(recordDisposition).toHaveBeenCalledTimes(1));
    const body = recordDisposition.mock.calls[0][1]!;
    expect(body.arm).toBe("unassisted");
    expect(body.evidence_opened).toBe(0);
  });

  it("REVIEW model verdict hides the Agree button (no mis-typed REVIEW submission path)", () => {
    mount("REVIEW");
    expect(screen.queryByText(/^Agree/)).toBeNull();
    expect(screen.getByTestId("disposition-verdict-override-go")).toBeInTheDocument();
  });
});
