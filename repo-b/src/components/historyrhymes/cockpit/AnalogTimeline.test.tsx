import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnalogTimeline, REFUSAL_LINE } from "./AnalogTimeline";
import { makeMatch, makeDegradedMatch, DEGRADED_REASONS } from "@/lib/historyrhymes/rhymesFixtures";

describe("AnalogTimeline", () => {
  it("renders one track per analog with rhyme score, year, components, and tags", () => {
    render(<AnalogTimeline match={makeMatch()} />);
    expect(screen.getByTestId("hr-analog-track-1")).toBeTruthy();
    expect(screen.getByTestId("hr-analog-track-2")).toBeTruthy();
    expect(screen.getByTestId("hr-analog-track-3")).toBeTruthy();
    expect(screen.getByTestId("hr-rhyme-score-1").textContent).toBe("rhyme 0.8731");
    expect(screen.getByText("2007-2009 GFC")).toBeTruthy();
    expect(screen.getByTestId("hr-analog-track-1").textContent).toContain("cosine 0.912");
    expect(screen.getByText(/req_abc123def456/)).toBeTruthy();
  });

  it("renders dtw as 'n/a (v1)' instead of blank", () => {
    render(<AnalogTimeline match={makeMatch()} />);
    expect(screen.getByTestId("hr-analog-dtw-1").textContent).toBe("dtw n/a (v1)");
  });

  it("marks non-event analogs explicitly", () => {
    render(<AnalogTimeline match={makeMatch()} />);
    expect(screen.getByText("non-event")).toBeTruthy();
  });

  it.each(DEGRADED_REASONS)("surfaces degraded_reason '%s' verbatim with the refusal line", (reason) => {
    render(<AnalogTimeline match={makeDegradedMatch(reason)} />);
    const note = screen.getByTestId("hr-degraded-note");
    expect(note.textContent).toContain(reason);
    expect(note.textContent).toContain(REFUSAL_LINE);
    expect(screen.queryByTestId("hr-analog-track-1")).toBeNull();
  });

  it("renders the fail-closed empty state when the match request itself failed", () => {
    render(<AnalogTimeline match={null} />);
    const empty = screen.getByTestId("hr-empty-state");
    expect(empty.getAttribute("data-zone")).toBe("analogs");
    expect(empty.textContent).toContain("match request failed or backend unreachable");
  });

  it("fires the evidence callback with the analog", () => {
    const onOpen = vi.fn();
    const match = makeMatch();
    render(<AnalogTimeline match={match} onOpenEvidence={onOpen} />);
    fireEvent.click(screen.getByTestId("hr-analog-track-1"));
    expect(onOpen).toHaveBeenCalledWith(match.top_analogs[0]);
  });
});
