import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImplicationCard } from "./ImplicationCard";
import type { Position } from "@/lib/historyrhymes/client";

const POSITION: Position = {
  asset: "TLT",
  direction: "long",
  size: 0.15,
  time_horizon_days: 30,
  entry_type: "staggered",
  key_drivers: ["yield_curve", "fed_tone"],
  top_analog: "1995 soft landing",
  rhyme_score: 0.87,
  invalidation: "10Y-2Y re-inverts below -0.25",
  next_check: "2026-06-15",
};

describe("ImplicationCard", () => {
  it("renders the position with reframed, non-trading copy", () => {
    render(<ImplicationCard position={POSITION} tier="act" />);
    const card = screen.getByTestId("hr-implication-card");
    expect(card.getAttribute("data-tier")).toBe("act");
    expect(screen.getByText("Implication")).toBeTruthy();
    expect(screen.getByTestId("hr-directional-bias").textContent).toBe("bias: long");
    expect(screen.getByText("Model exposure")).toBeTruthy();
    expect(screen.getByText("15%")).toBeTruthy();
    expect(screen.getByText(/1995 soft landing/)).toBeTruthy();
    expect(screen.getByText(/rhyme 0\.87/)).toBeTruthy();
    // The card must not read like a retail trading signal.
    expect(card.textContent).not.toMatch(/\b(ACT|BUY|SELL|TRADE)\b/);
  });

  it("relabels watch and research tiers", () => {
    const { rerender } = render(<ImplicationCard position={POSITION} tier="watch" />);
    expect(screen.getByText("Watch item")).toBeTruthy();
    rerender(<ImplicationCard position={POSITION} tier="research" />);
    expect(screen.getByText("Research item")).toBeTruthy();
  });

  it("omits the analog line when top_analog is 'none'", () => {
    render(<ImplicationCard position={{ ...POSITION, top_analog: "none" }} />);
    expect(screen.queryByText(/top analog/)).toBeNull();
  });
});
