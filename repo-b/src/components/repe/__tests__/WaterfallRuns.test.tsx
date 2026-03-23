import React from "react";
import { render, screen } from "@testing-library/react";

import { WaterfallRuns } from "@/components/repe/WaterfallRuns";
import { makeTestLogger } from "@/test/testLogger";

test("WaterfallRuns lock state rules", () => {
  const tlog = makeTestLogger("WaterfallRuns");
  render(
    <WaterfallRuns
      rows={[
        { runId: "run-1", status: "completed" },
        { runId: "run-2", status: "locked" },
      ]}
    />
  );

  expect(screen.getByTestId("waterfall-lock-run-1")).toBeEnabled();
  expect(screen.getByTestId("waterfall-lock-run-2")).toBeDisabled();
  tlog.log("test.ok", "Waterfall lock button states validated");
});

test("WaterfallRuns shows new run notice", () => {
  render(
    <WaterfallRuns
      rows={[{ runId: "run-3", status: "completed" }]}
      hasNewRun
    />
  );

  expect(screen.getByTestId("waterfall-new-run-toast")).toHaveTextContent("New run available");
});
