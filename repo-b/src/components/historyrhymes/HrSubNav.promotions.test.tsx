import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// HrSubNav is imported dynamically per-test after mocking next/navigation.

describe("HrSubNav — Promotions tab", () => {
  it("includes a Promotions tab linking to the promotions route", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({ usePathname: () => "/lab/env/e1/historyrhymes/routine" }));
    const { HrSubNav: Nav } = await import("./HrSubNav");
    render(<Nav envId="e1" />);
    const link = screen.getByText("Promotions").closest("a");
    expect(link?.getAttribute("href")).toBe("/lab/env/e1/historyrhymes/promotions");
  });

  it("marks Promotions active (longest-prefix) on the promotions route without double-highlighting", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({ usePathname: () => "/lab/env/e1/historyrhymes/promotions" }));
    const { HrSubNav: Nav } = await import("./HrSubNav");
    render(<Nav envId="e1" />);
    const active = screen.getByText("Promotions").closest("a");
    expect(active?.className).toContain("text-sky-200");
    // ML Algorithm Lab must NOT also be active
    const ml = screen.getByText("ML Algorithm Lab").closest("a");
    expect(ml?.className).not.toContain("text-sky-200");
  });
});
