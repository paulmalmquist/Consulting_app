import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DlqPanel from "./DlqPanel";

describe("DlqPanel CSV export (8C)", () => {
  it("labels the source honestly and disables export with a reason when empty", () => {
    render(<DlqPanel rows={[]} count={0} />);
    expect(screen.getByText(/recorded-capture replay/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/i })).toBeDisabled();
  });

  it("enables the CSV export when there are dead letters", () => {
    render(
      <DlqPanel
        rows={[{ ts_ms: 1700, topic: "stargate.printer.telemetry.v1", reason: "decode_error", raw_preview: "ab", raw_bytes: 12 }]}
        count={1}
      />,
    );
    expect(screen.getByRole("button", { name: /Export CSV/i })).not.toBeDisabled();
  });
});
