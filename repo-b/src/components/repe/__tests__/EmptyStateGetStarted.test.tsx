import React from "react";
import { render, screen } from "@testing-library/react";

import { EmptyStateGetStarted } from "@/components/repe/EmptyStateGetStarted";
import { makeTestLogger } from "@/test/testLogger";

test("Empty state shows Get Started flow", () => {
  const tlog = makeTestLogger("EmptyStateGetStarted");
  render(<EmptyStateGetStarted show />);

  expect(screen.getByText("Get Started")).toBeInTheDocument();
  tlog.log("test.ok", "Empty state rendered");
});
