// Source-kind honesty framework (Phase 8). Every drill-through / export carries one
// of these so a surface never implies more than its data has. See plan 0012.

export type SourceKind = "live-rows" | "computed-artifact" | "fixture" | "unavailable";

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  "live-rows": "Live rows",
  "computed-artifact": "Computed evidence artifact — not live serving",
  fixture: "Committed export / replay fixture",
  unavailable: "Row-level data unavailable",
};

// A short tag-style label for chips.
export const SOURCE_KIND_TAG: Record<SourceKind, string> = {
  "live-rows": "live rows",
  "computed-artifact": "computed artifact",
  fixture: "fixture",
  unavailable: "unavailable",
};
