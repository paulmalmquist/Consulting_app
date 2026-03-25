import { describe, expect, it, vi } from "vitest";
import { getFundDetail } from "./repeFunds";

describe("getFundDetail", () => {
  it("returns fund detail and ordered terms", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            fund_id: "fund-1",
            business_id: "biz-1",
            name: "Fund Alpha",
            vintage_year: 2026,
            fund_type: "closed_end",
            strategy: "equity",
            sub_strategy: null,
            target_size: "100000000",
            term_years: 10,
            status: "investing",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            term_id: "term-1",
            fund_id: "fund-1",
            effective_date: "2026-01-01",
            preferred_return_rate: "0.08",
            carry_rate: "0.20",
            waterfall_style: "european",
            management_fee_rate: "0.02",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      });

    const detail = await getFundDetail({ query } as never, "fund-1");

    expect(detail).toEqual({
      fund: {
        fund_id: "fund-1",
        business_id: "biz-1",
        name: "Fund Alpha",
        vintage_year: 2026,
        fund_type: "closed_end",
        strategy: "equity",
        sub_strategy: null,
        target_size: "100000000",
        term_years: 10,
        status: "investing",
        created_at: "2026-01-01T00:00:00Z",
      },
      terms: [
        {
          term_id: "term-1",
          fund_id: "fund-1",
          effective_date: "2026-01-01",
          preferred_return_rate: "0.08",
          carry_rate: "0.20",
          waterfall_style: "european",
          management_fee_rate: "0.02",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("returns null when the fund is missing and tolerates missing terms", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("terms missing"));

    const detail = await getFundDetail({ query } as never, "missing-fund");

    expect(detail).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });
});
