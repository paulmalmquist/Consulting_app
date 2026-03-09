import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FundDeleteDialog } from "@/components/repe/FundDeleteDialog";

describe("FundDeleteDialog", () => {
  test("requires the exact fund name before enabling deletion", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <FundDeleteDialog
        open
        onOpenChange={() => undefined}
        fundName="Institutional Growth Fund VII"
        investmentCount={12}
        assetCount={21}
        onConfirm={onConfirm}
      />
    );

    const deleteButton = screen.getByRole("button", { name: "Delete Fund" });
    const input = screen.getByPlaceholderText("Institutional Growth Fund VII");

    expect(deleteButton).toBeDisabled();

    await user.type(input, "Wrong Fund");
    expect(deleteButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, "Institutional Growth Fund VII");
    expect(deleteButton).toBeEnabled();

    await user.click(deleteButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
