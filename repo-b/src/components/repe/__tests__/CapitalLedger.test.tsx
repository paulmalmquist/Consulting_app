import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { CapitalLedger } from "@/components/repe/CapitalLedger";
import { makeTestLogger } from "@/test/testLogger";

test("CapitalLedger filter updates table", () => {
  const tlog = makeTestLogger("CapitalLedger");
  render(
    <CapitalLedger
      rows={[
        { id: "1", type: "call", amount: 100 },
        { id: "2", type: "distribution", amount: 50 },
      ]}
    />
  );

  expect(screen.getAllByTestId("ledger-row")).toHaveLength(2);
  fireEvent.change(screen.getByTestId("ledger-filter"), { target: { value: "call" } });
  expect(screen.getAllByTestId("ledger-row")).toHaveLength(1);
  tlog.log("test.ok", "Ledger filter applied");
});
