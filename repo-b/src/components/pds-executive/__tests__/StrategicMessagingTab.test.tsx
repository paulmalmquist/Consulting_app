import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StrategicMessagingTab from "@/components/pds-executive/StrategicMessagingTab";

describe("StrategicMessagingTab", () => {
  it("renders drafts and approve action", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn(async () => {});

    render(
      <StrategicMessagingTab
        loading={false}
        generating={false}
        drafts={[
          {
            draft_id: "d1",
            draft_type: "internal_memo",
            title: "Internal Memo",
            body_text: "AI supports delivery outcomes.",
            status: "draft",
          },
        ]}
        onGenerate={async () => {}}
        onApprove={onApprove}
      />,
    );

    expect(screen.getByText("Executive Narrative Engine")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve Draft" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});
