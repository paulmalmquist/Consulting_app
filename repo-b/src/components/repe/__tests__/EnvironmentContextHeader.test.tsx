import React from "react";
import { render, screen } from "@testing-library/react";

import { EnvironmentContextHeader } from "@/components/repe/EnvironmentContextHeader";
import { makeTestLogger } from "@/test/testLogger";

test("EnvironmentContextHeader renders env, as-of date, and status", () => {
  const tlog = makeTestLogger("EnvironmentContextHeader");
  tlog.log("test.start", "Render environment context header");

  render(<EnvironmentContextHeader envLabel="Live" asOfDate="2028-12-31" status="active" />);

  expect(screen.getByTestId("repe-env-label")).toHaveTextContent("Live");
  expect(screen.getByTestId("repe-as-of-date")).toHaveTextContent("2028-12-31");
  expect(screen.getByTestId("repe-env-status")).toHaveTextContent("active");
  tlog.log("test.ok", "EnvironmentContextHeader assertions passed");
});
