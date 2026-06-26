import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import DlqInspectionDrawer from "./DlqInspectionDrawer";
import type { DlqRow } from "@/lib/lab/stargateStream";

const ROW: DlqRow = {
  ts_ms: 1_700_000_000_000, topic: "stargate.raw.v1", reason: "protobuf_decode_error",
  raw_preview: "0x0a14...corrupt", raw_bytes: 248,
};

describe("DlqInspectionDrawer", () => {
  it("is closed when no row is selected", () => {
    render(<DlqInspectionDrawer row={null} onClose={() => {}} />);
    expect(screen.queryByText("Dead letter inspection")).toBeNull();
  });

  it("shows the full dead-letter record + the fail-closed framing", () => {
    render(<DlqInspectionDrawer row={ROW} onClose={() => {}} />);
    expect(screen.getByText("Dead letter inspection")).toBeInTheDocument();
    expect(screen.getByText("stargate.raw.v1")).toBeInTheDocument();      // topic
    expect(screen.getAllByText("248B").length).toBeGreaterThanOrEqual(1);  // raw bytes (tag + row)
    expect(screen.getByText("0x0a14...corrupt")).toBeInTheDocument();      // full raw preview
    expect(screen.getByText(/routed to the dead letter queue rather than crashing ingestion/i)).toBeInTheDocument();
  });

  it("fails closed on a missing topic / preview (no blank, no fabrication)", () => {
    render(<DlqInspectionDrawer row={{ ...ROW, topic: "", raw_preview: "" }} onClose={() => {}} />);
    expect(screen.getByText(/not available - topic not on the dead-letter record/)).toBeInTheDocument();
    expect(screen.getByText(/not available - no preview captured/)).toBeInTheDocument();
  });
});
