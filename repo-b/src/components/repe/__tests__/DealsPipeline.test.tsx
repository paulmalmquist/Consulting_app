import React from "react";
import { render, screen } from "@testing-library/react";

import { DealsPipeline } from "@/components/repe/DealsPipeline";
import { makeTestLogger } from "@/test/testLogger";

test("DealsPipeline renders stage counts", () => {
  const tlog = makeTestLogger("DealsPipeline");
  render(<DealsPipeline buckets={[{ stage: "pipeline", count: 3 }, { stage: "ic", count: 1 }]} />);

  expect(screen.getByTestId("deal-count-pipeline")).toHaveTextContent("3");
  expect(screen.getByTestId("deal-count-ic")).toHaveTextContent("1");
  tlog.log("test.ok", "Deal stage counts displayed");
});
