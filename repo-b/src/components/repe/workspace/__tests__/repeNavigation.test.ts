import { describe, expect, it } from "vitest";
import {
  buildRepeNavGroups,
  getActiveRepeGroupKey,
} from "@/components/repe/workspace/repeNavigation";

describe("REPE navigation model", () => {
  const base = "/lab/env/test-env/re";
  const groups = buildRepeNavGroups({
    base,
    showIntelligence: false,
    showSustainability: false,
  });

  it("follows the institutional workflow section order", () => {
    expect(groups.map((group) => group.label)).toEqual([
      "Acquisitions",
      "Portfolio",
      "Investor Management",
      "Accounting",
      "Insights",
      "Governance",
      "Automation",
    ]);
  });

  it("maps the core section items to the requested order", () => {
    expect(groups[0]?.items.map((item) => item.label)).toEqual(["Pipeline"]);
    expect(groups[1]?.items.map((item) => item.label)).toEqual(["Funds", "Investments", "Assets"]);
    expect(groups[2]?.items.map((item) => item.label)).toEqual(["Investors", "Capital Calls", "Distributions"]);
    expect(groups[3]?.items.map((item) => item.label)).toEqual(["Fees", "Period Close", "Variance"]);
    expect(groups[4]?.items.map((item) => item.label)).toEqual(["Dashboards", "Reports", "Saved Views", "Models"]);
    expect(groups[5]?.items.map((item) => item.label)).toEqual(["Documents", "Approvals"]);
    expect(groups[6]?.items.map((item) => item.label)).toEqual(["Winston"]);
  });

  it("keeps parent group context active for nested routes", () => {
    expect(getActiveRepeGroupKey(`${base}/assets/asset-123`, groups)).toBe("portfolio");
    expect(getActiveRepeGroupKey(`${base}/controls`, groups)).toBe("governance");
    expect(getActiveRepeGroupKey(`${base}/variance`, groups)).toBe("accounting");
    expect(getActiveRepeGroupKey(`${base}/winston`, groups)).toBe("automation");
  });
});
