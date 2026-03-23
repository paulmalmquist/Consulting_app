import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { FundsList } from "@/components/repe/FundsList";
import { makeTestLogger } from "@/test/testLogger";

test("FundsList renders rows and applies filters", () => {
  const tlog = makeTestLogger("FundsList");
  render(
    <FundsList
      rows={[
        { id: "1", name: "Alpha Fund", strategy: "Core" },
        { id: "2", name: "Bravo Fund", strategy: "Value-Add" },
      ]}
    />
  );
  tlog.log("test.render", "Funds list rendered");

  expect(screen.getByTestId("funds-count")).toHaveTextContent("2 funds");
  fireEvent.change(screen.getByTestId("funds-filter"), { target: { value: "Bravo" } });
  expect(screen.getByTestId("funds-count")).toHaveTextContent("1 funds");
  tlog.log("test.ok", "Funds filtering validated");
});
