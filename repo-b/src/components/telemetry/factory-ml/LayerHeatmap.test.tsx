import { describe, it, expect } from "vitest";

import { heatmapExportRows, HEATMAP_EXPORT_COLUMNS } from "./LayerHeatmap";
import type { HeatmapExport } from "@/lib/lab/factoryMlData";

const DATA: HeatmapExport = {
  anchor_pair: ["TEST-HOTFIRE-2026-00041", "TEST-HOTFIRE-2026-00088"],
  runs: [
    { run_id: "TEST-HOTFIRE-2026-00041", pattern: "failed", scenario_id: "SCN-005",
      cells: [{ w: 0, z: 0.2 }, { w: 1, z: 5.1 }] },
    { run_id: "TEST-HOTFIRE-2026-00025", pattern: "false_positive", scenario_id: null,
      cells: [{ w: 0, z: -0.4 }] },
  ],
};

describe("heatmapExportRows (8F-2)", () => {
  it("flattens to one long-form row per (run, window) cell with the anchor flag, no fabrication", () => {
    const rows = heatmapExportRows(DATA);
    expect(rows).toHaveLength(3); // 2 anchor cells + 1 other cell — exactly the cells shown
    expect(HEATMAP_EXPORT_COLUMNS).toEqual(["run_id", "pattern", "scenario_id", "is_anchor", "window_w", "z"]);

    const anchorCell = rows.find((r) => r.run_id === "TEST-HOTFIRE-2026-00041" && r.window_w === 1)!;
    expect(anchorCell.is_anchor).toBe(true);
    expect(anchorCell.z).toBe(5.1); // real z preserved, not clamped/rounded
    expect(anchorCell.scenario_id).toBe("SCN-005");

    // a non-anchor run: flag false, null scenario flattened to "" (no invented value)
    const other = rows.find((r) => r.run_id === "TEST-HOTFIRE-2026-00025")!;
    expect(other.is_anchor).toBe(false);
    expect(other.scenario_id).toBe("");
    expect(other.pattern).toBe("false_positive");
  });

  it("returns no rows when there are no runs (fail-closed, nothing invented)", () => {
    expect(heatmapExportRows({ anchor_pair: [], runs: [] })).toEqual([]);
  });
});
