import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResearchBriefUpload } from "./ResearchBriefUpload";

const postResearchBrief = vi.fn();

vi.mock("@/lib/historyrhymes/client", () => ({
  postResearchBrief: (...args: unknown[]) => postResearchBrief(...args),
}));

describe("ResearchBriefUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits pasted markdown and surfaces the result banner", async () => {
    postResearchBrief.mockResolvedValue({
      brief: { brief_id: "b1" },
      candidates: [{ candidate_id: "c1" }],
      warnings: [],
      confidence: 1.0,
      degraded: false,
    });
    const onIngested = vi.fn();
    render(<ResearchBriefUpload onIngested={onIngested} />);

    fireEvent.change(screen.getByTestId("hr-brief-textarea"), {
      target: { value: "# HR Weekly Brief\n## Enhancement Path\n- **X** — y" },
    });
    fireEvent.click(screen.getByTestId("hr-brief-submit"));

    await waitFor(() => {
      expect(postResearchBrief).toHaveBeenCalledTimes(1);
      expect(onIngested).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("hr-ingest-result").textContent).toContain(
      "Extraction OK",
    );
  });

  it("shows degraded warnings when extraction is weak", async () => {
    postResearchBrief.mockResolvedValue({
      brief: { brief_id: "b2" },
      candidates: [],
      warnings: ["No Enhancement Path section found"],
      confidence: 0.14,
      degraded: true,
    });
    render(<ResearchBriefUpload onIngested={vi.fn()} />);

    fireEvent.change(screen.getByTestId("hr-brief-textarea"), {
      target: { value: "garbage" },
    });
    fireEvent.click(screen.getByTestId("hr-brief-submit"));

    await waitFor(() => {
      const banner = screen.getByTestId("hr-ingest-result");
      expect(banner.textContent).toContain("Degraded extraction");
      expect(banner.textContent).toContain("No Enhancement Path section found");
    });
  });

  it("disables submit when markdown is empty", () => {
    render(<ResearchBriefUpload onIngested={vi.fn()} />);
    const btn = screen.getByTestId("hr-brief-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
