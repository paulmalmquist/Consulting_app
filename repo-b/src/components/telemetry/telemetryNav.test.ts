import {
  TELEMETRY_NAV,
  isTelemetryItemActive,
  telemetryHref,
} from "./telemetryNav";

describe("telemetry metadata navigation", () => {
  it("registers Metadata Explorer in the grouped drawer without expanding mobile primary tabs", () => {
    const item = TELEMETRY_NAV.find((entry) => entry.slug === "metadata");
    expect(item).toMatchObject({
      label: "Metadata Explorer",
      group: "AI & Governance",
    });
    expect(item?.mobilePrimary).not.toBe(true);
    expect(TELEMETRY_NAV.filter((entry) => entry.mobilePrimary)).toHaveLength(4);
  });

  it("builds and recognizes the env-scoped metadata route", () => {
    expect(telemetryHref("env-1", "metadata")).toBe(
      "/lab/env/env-1/telemetry/metadata",
    );
    expect(
      isTelemetryItemActive(
        "/lab/env/env-1/telemetry/metadata",
        "env-1",
        "metadata",
      ),
    ).toBe(true);
  });
});
