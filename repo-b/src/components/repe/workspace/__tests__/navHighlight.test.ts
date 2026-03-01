/**
 * Unit tests for RE workspace nav highlight logic.
 *
 * Verifies that the isActive function correctly identifies
 * which nav item should be highlighted for each route.
 */

// Extracted logic from RepeWorkspaceShell.tsx
function isActive(pathname: string, href: string, isBase: boolean): boolean {
  if (isBase) {
    return pathname === href || pathname.startsWith(`${href}/funds/`) || pathname.startsWith(`${href}/funds`);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

const BASE = "/lab/env/abc123/re";

const navItems = [
  { href: BASE, label: "Funds", isBase: true },
  { href: `${BASE}/deals`, label: "Investments", isBase: false },
  { href: `${BASE}/assets`, label: "Assets", isBase: false },
  { href: `${BASE}/scenarios`, label: "Scenarios", isBase: false },
  { href: `${BASE}/runs/quarter-close`, label: "Run Center", isBase: false },
  { href: `${BASE}/sustainability`, label: "Sustainability", isBase: false },
];

function activeLabels(pathname: string): string[] {
  return navItems
    .filter((item) => isActive(pathname, item.href, item.isBase))
    .map((item) => item.label);
}

describe("RE nav highlight logic", () => {
  test("Funds page highlights only Funds", () => {
    expect(activeLabels(BASE)).toEqual(["Funds"]);
  });

  test("Investments page highlights only Investments (not Funds)", () => {
    const active = activeLabels(`${BASE}/deals`);
    expect(active).toEqual(["Investments"]);
    expect(active).not.toContain("Funds");
  });

  test("Assets page highlights only Assets (not Funds)", () => {
    const active = activeLabels(`${BASE}/assets`);
    expect(active).toEqual(["Assets"]);
    expect(active).not.toContain("Funds");
  });

  test("Scenarios page highlights only Scenarios", () => {
    expect(activeLabels(`${BASE}/scenarios`)).toEqual(["Scenarios"]);
  });

  test("Run Center highlights only Run Center", () => {
    expect(activeLabels(`${BASE}/runs/quarter-close`)).toEqual(["Run Center"]);
  });

  test("Sustainability highlights only Sustainability", () => {
    expect(activeLabels(`${BASE}/sustainability`)).toEqual(["Sustainability"]);
    expect(activeLabels(`${BASE}/sustainability?section=overview`.split("?")[0])).toEqual(["Sustainability"]);
  });

  test("Fund detail page highlights Funds", () => {
    expect(activeLabels(`${BASE}/funds/a1b2c3d4-0001-0010-0001-000000000001`)).toEqual(["Funds"]);
  });

  test("Deal detail page highlights Investments", () => {
    expect(activeLabels(`${BASE}/deals/a1b2c3d4-0001-0010-0002-000000000001`)).toEqual(["Investments"]);
  });

  test("Asset detail page highlights Assets", () => {
    expect(activeLabels(`${BASE}/assets/a1b2c3d4-0001-0010-0003-000000000001`)).toEqual(["Assets"]);
  });

  test("Investment detail (v2) does NOT highlight Funds", () => {
    const active = activeLabels(`${BASE}/investments/a1b2c3d4-0001-0010-0002-000000000001`);
    expect(active).not.toContain("Funds");
  });

  test("JV detail does NOT highlight Funds", () => {
    const active = activeLabels(`${BASE}/jv/some-jv-id-here`);
    expect(active).not.toContain("Funds");
  });

  test("Sustainability route does NOT highlight Funds", () => {
    const active = activeLabels(`${BASE}/sustainability`);
    expect(active).not.toContain("Funds");
  });
});
