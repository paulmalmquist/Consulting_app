import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import RepeFinancePage from "@/app/app/finance/repe/page";

vi.mock("@/lib/repe-context", () => ({
  useRepeContext: () => ({
    businessId: "biz-1",
    loading: false,
  }),
}));

vi.mock("@/lib/bos-api", () => ({
  listFinPartitions: vi.fn().mockResolvedValue([{ partition_id: "p-live", partition_type: "live", key: "live" }]),
  listFinParticipants: vi.fn().mockResolvedValue([]),
  listFinFunds: vi.fn().mockResolvedValue([]),
  listFinCommitments: vi.fn().mockResolvedValue([]),
  listFinCapitalCalls: vi.fn().mockResolvedValue([]),
  listFinAssets: vi.fn().mockResolvedValue([]),
  listFinDistributionEvents: vi.fn().mockResolvedValue([]),
  listFinDistributionPayouts: vi.fn().mockResolvedValue([]),
  listFinWaterfallAllocations: vi.fn().mockResolvedValue([]),
  createFinFund: vi.fn(),
  createFinParticipant: vi.fn(),
  createFinCommitment: vi.fn(),
  createFinCapitalCall: vi.fn(),
  createFinAsset: vi.fn(),
  createFinDistributionEvent: vi.fn(),
  runFinWaterfall: vi.fn(),
}));

describe("finance repe page", () => {
  test("does not block on business-first prompt and shows fund-first empty state", async () => {
    render(<RepeFinancePage />);
    await waitFor(() => expect(screen.getByTestId("repe-fund-empty")).toBeInTheDocument());
    expect(screen.queryByText("Select or create a business to access Finance.")).not.toBeInTheDocument();
  });
});
