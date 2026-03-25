/**
 * Test sidebar highlights correct item for each route.
 */
import { describe, expect, it } from "vitest";

// Replicate the isActive logic from RepeWorkspaceShell
function isActive(pathname: string, href: string, isBase: boolean): boolean {
  if (isBase) {
    if (pathname === href) return true;
    if (pathname.startsWith(`${href}/funds`)) return true;
    if (pathname.startsWith(`${href}/portfolio`)) return true;
    return false;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

describe("Sidebar active state", () => {
  const base = "/lab/env/test-env/re";
  const navItems = [
    { href: base, label: "Funds", isBase: true },
    { href: `${base}/deals`, label: "Investments", isBase: false },
    { href: `${base}/assets`, label: "Assets", isBase: false },
    { href: `${base}/scenarios`, label: "Scenarios", isBase: false },
    { href: `${base}/sustainability`, label: "Sustainability", isBase: false },
  ];

  function getActiveLabel(pathname: string): string | null {
    for (const item of navItems) {
      if (isActive(pathname, item.href, item.isBase)) return item.label;
    }
    return null;
  }

  function getActiveLabels(pathname: string): string[] {
    return navItems.filter((item) => isActive(pathname, item.href, item.isBase)).map((item) => item.label);
  }

  it("Funds route highlights Funds only", () => {
    const active = getActiveLabels(`${base}/funds`);
    expect(active).toEqual(["Funds"]);
  });

  it("Fund detail highlights Funds only", () => {
    const active = getActiveLabels(`${base}/funds/some-uuid`);
    expect(active).toEqual(["Funds"]);
  });

  it("Investments route highlights Investments only", () => {
    const active = getActiveLabels(`${base}/deals`);
    expect(active).toEqual(["Investments"]);
  });

  it("Assets route highlights Assets only", () => {
    const active = getActiveLabels(`${base}/assets`);
    expect(active).toEqual(["Assets"]);
  });

  it("Scenarios route highlights Scenarios only", () => {
    const active = getActiveLabels(`${base}/scenarios`);
    expect(active).toEqual(["Scenarios"]);
  });

  it("Sustainability route highlights Sustainability only", () => {
    const active = getActiveLabels(`${base}/sustainability`);
    expect(active).toEqual(["Sustainability"]);
  });

  it("Base route highlights Funds", () => {
    const active = getActiveLabels(base);
    expect(active).toEqual(["Funds"]);
  });

  it("Portfolio route highlights Funds", () => {
    const active = getActiveLabels(`${base}/portfolio`);
    expect(active).toEqual(["Funds"]);
  });

  it("Fund detail does NOT highlight Investments or Assets", () => {
    const active = getActiveLabels(`${base}/funds/some-uuid`);
    expect(active).not.toContain("Investments");
    expect(active).not.toContain("Assets");
  });

  it("Sustainability route does NOT highlight Funds", () => {
    const active = getActiveLabels(`${base}/sustainability`);
    expect(active).not.toContain("Funds");
  });
});
