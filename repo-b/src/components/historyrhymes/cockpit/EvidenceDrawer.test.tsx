import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { analogEvidence } from "@/lib/historyrhymes/evidence";
import { makeMatch } from "@/lib/historyrhymes/rhymesFixtures";

const MATCH = makeMatch();
const PAYLOAD = analogEvidence(MATCH.top_analogs[0], MATCH);

describe("EvidenceDrawer", () => {
  it("renders nothing when there is no evidence", () => {
    render(<EvidenceDrawer evidence={null} onClose={() => {}} />);
    expect(screen.queryByTestId("hr-evidence-drawer")).toBeNull();
  });

  it("renders fields, nullReasons, request id, and collapsed raw JSON", () => {
    render(<EvidenceDrawer evidence={PAYLOAD} onClose={() => {}} />);
    expect(screen.getByTestId("hr-evidence-drawer")).toBeTruthy();
    expect(screen.getByText("#1 2007-2009 GFC")).toBeTruthy();
    // dtw is null in v1: its row shows the reason, not a blank.
    const fields = screen.getAllByTestId("hr-evidence-field").map((f) => f.textContent ?? "");
    expect(fields.some((t) => t.includes("dtw") && t.includes("v1"))).toBe(true);
    expect(screen.getByTestId("hr-evidence-request-id").textContent).toContain("req_abc123def456");
    const raw = screen.getByTestId("hr-evidence-raw");
    expect(raw.hasAttribute("open")).toBe(false); // collapsed by default
    expect(raw.textContent).toContain("rhyme_score");
  });

  it("closes via the close button and the backdrop", () => {
    const onClose = vi.fn();
    render(<EvidenceDrawer evidence={PAYLOAD} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("hr-evidence-close"));
    fireEvent.click(screen.getByTestId("hr-evidence-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<EvidenceDrawer evidence={PAYLOAD} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
