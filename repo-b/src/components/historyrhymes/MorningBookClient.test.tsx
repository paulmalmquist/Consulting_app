import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MorningBookClient } from "./MorningBookClient";
import type { MorningBookData } from "@/lib/historyrhymes/client";

const fetchMorningBook = vi.fn();

vi.mock("@/lib/historyrhymes/client", () => ({
  fetchMorningBook: () => fetchMorningBook(),
}));

const FULL: MorningBookData = {
  current_regime: "crisis",
  what_changed: [
    "Regime call shifted: late_cycle → crisis",
    "Confidence decreased from 0.72 to 0.55",
  ],
  confidence: { current: 0.55, previous: 0.72, delta: -0.17, status: "deteriorating" },
  freshness: {
    latest_brief_date: "2026-05-18",
    previous_brief_date: "2026-05-11",
    status: "fresh",
  },
  top_risks: ["False normalization"],
  top_new_enhancements: ["Add yield_curve_velocity"],
  triage: "Act Now",
  warnings: [],
};

describe("MorningBookClient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the six sections + triage badge on a normal response", async () => {
    fetchMorningBook.mockResolvedValue(FULL);
    render(<MorningBookClient envId="demo" />);

    await waitFor(() => {
      expect(screen.getByTestId("hr-morning-book-header")).toBeTruthy();
    });
    expect(screen.getByTestId("hr-triage-badge").textContent).toBe("Act Now");
    expect(screen.getByTestId("hr-what-changed")).toBeTruthy();
    expect(screen.getByTestId("hr-confidence-freshness")).toBeTruthy();
    expect(screen.getByTestId("hr-risk-panel")).toBeTruthy();
    expect(screen.getByTestId("hr-enhancement-panel")).toBeTruthy();
    expect(screen.getByText("crisis")).toBeTruthy();
    expect(screen.getByText("False normalization")).toBeTruthy();
    // No warnings banner on a clean response.
    expect(screen.queryByTestId("hr-morning-book-warnings")).toBeNull();
  });

  it("shows the warnings banner in degraded / initialization state", async () => {
    fetchMorningBook.mockResolvedValue({
      ...FULL,
      triage: "Research Only",
      warnings: [
        "Only one brief available; cannot compute a delta until a second brief is ingested.",
        "Morning Book operating in initialization mode.",
      ],
      what_changed: [
        "No previous brief to diff against; this is the first ingested brief.",
      ],
    });
    render(<MorningBookClient envId="demo" />);

    await waitFor(() => {
      const banner = screen.getByTestId("hr-morning-book-warnings");
      expect(banner.textContent).toContain("initialization mode");
    });
    expect(screen.getByTestId("hr-triage-badge").textContent).toBe(
      "Research Only",
    );
  });

  it("shows the empty-state lists when there are no risks/enhancements", async () => {
    fetchMorningBook.mockResolvedValue({
      ...FULL,
      top_risks: [],
      top_new_enhancements: [],
    });
    render(<MorningBookClient envId="demo" />);

    await waitFor(() => {
      expect(
        screen.getByText("No flagged risks vs previous brief."),
      ).toBeTruthy();
    });
    expect(
      screen.getByText("No new enhancements vs previous brief."),
    ).toBeTruthy();
  });

  it("renders an unavailable message when the fetch returns null", async () => {
    fetchMorningBook.mockResolvedValue(null);
    render(<MorningBookClient envId="demo" />);
    await waitFor(() => {
      expect(screen.getByText(/Morning Book unavailable/)).toBeTruthy();
    });
  });
});
