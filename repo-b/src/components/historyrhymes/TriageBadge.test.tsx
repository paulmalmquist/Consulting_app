import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TriageBadge } from "./TriageBadge";
import type { TriageState } from "@/lib/historyrhymes/client";

describe("TriageBadge", () => {
  it.each<TriageState>(["Act Now", "Watch", "Research Only"])(
    "renders %s with the matching text + data attr",
    (triage) => {
      render(<TriageBadge triage={triage} />);
      const badge = screen.getByTestId("hr-triage-badge");
      expect(badge.textContent).toBe(triage);
      expect(badge.getAttribute("data-triage")).toBe(triage);
    },
  );

  it("uses the red class for Act Now and amber for Watch", () => {
    const { rerender } = render(<TriageBadge triage="Act Now" />);
    expect(screen.getByTestId("hr-triage-badge").className).toContain("red");
    rerender(<TriageBadge triage="Watch" />);
    expect(screen.getByTestId("hr-triage-badge").className).toContain("amber");
  });
});
