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
      "Portfolio",
      "Investor Operations",
      "Fund Accounting",
      "Analytics",
      "Acquisitions",
      "Governance",
      "Automation",
    ]);
  });

  it("maps the core section items to the requested order", () => {
    expect(groups[0]?.items.map((item) => item.label)).toEqual(["Funds", "Investments", "Assets"]);
    expect(groups[1]?.items.map((item) => item.label)).toEqual(["Investors", "Capital Calls", "Distributions", "Fees"]);
    expect(groups[2]?.items.map((item) => item.label)).toEqual(["Period Close", "Variance"]);
    expect(groups[3]?.items.map((item) => item.label)).toEqual(["Models", "Dashboards", "Saved Analyses", "Reports", "Sustainability"]);
    expect(groups[4]?.items.map((item) => item.label)).toEqual(["Pipeline"]);
    expect(groups[5]?.items.map((item) => item.label)).toEqual(["Documents", "Approvals"]);
    expect(groups[6]?.items.map((item) => item.label)).toEqual(["Winston"]);
  });

  it("always includes Sustainability in Analytics even when the legacy flag is off", () => {
    expect(groups[3]?.items.some((item) => item.label === "Sustainability")).toBe(true);
  });

  it("keeps parent group context active for nested routes", () => {
    expect(getActiveRepeGroupKey(`${base}/assets/asset-123`, groups)).toBe("portfolio");
    expect(getActiveRepeGroupKey(`${base}/controls`, groups)).toBe("governance");
    expect(getActiveRepeGroupKey(`${base}/variance`, groups)).toBe("fund-accounting");
    expect(getActiveRepeGroupKey(`${base}/winston`, groups)).toBe("automation");
  });
});
