import { getAssetDiagnostics } from "./asset-diagnostics";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/repe-context", () => ({
  useRepeContext: () => ({ environmentId: "env-1" }),
  useRepeBasePath: () => "/lab/env/env-1/re",
}));

describe("getAssetDiagnostics", () => {
  test("flags suspicious asset metric and mapping states", () => {
    const diagnostics = getAssetDiagnostics([
      {
        asset_id: "asset-1",
        name: "Negative NAV Asset",
        asset_type: "property",
        units: 10,
        square_feet: 0,
        status: "active",
        investment_id: "",
        investment_name: "",
        fund_id: "",
        fund_name: "",
        latest_value: -100,
        latest_occupancy: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);

    expect(diagnostics.join(" ")).toContain("negative value/NAV proxy");
    expect(diagnostics.join(" ")).toContain("missing occupancy");
    expect(diagnostics.join(" ")).toContain("missing canonical fund/investment mapping");
    expect(diagnostics.join(" ")).toContain("DSCR is not returned");
  });
});
