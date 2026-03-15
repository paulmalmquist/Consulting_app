import type { Pool } from "pg";

type FundDetailRow = {
  fund_id: string;
  business_id: string;
  name: string;
  vintage_year: number | null;
  fund_type: string | null;
  strategy: string | null;
  sub_strategy: string | null;
  target_size: string | null;
  term_years: number | null;
  status: string | null;
  created_at: string;
};

type FundTermRow = {
  term_id: string;
  fund_id: string;
  effective_date: string;
  preferred_return_rate: string | null;
  carry_rate: string | null;
  waterfall_style: string | null;
  management_fee_rate: string | null;
  created_at: string;
};

export type RepeFundDetail = {
  fund: FundDetailRow;
  terms: FundTermRow[];
};

type QueryablePool = Pick<Pool, "query">;

export async function getFundDetail(
  pool: QueryablePool,
  fundId: string
): Promise<RepeFundDetail | null> {
  const [fundRes, termsRes] = await Promise.all([
    pool.query<FundDetailRow>(
      `SELECT
         fund_id::text, business_id::text, name, vintage_year,
         fund_type, strategy, sub_strategy, target_size, term_years,
         status, created_at
       FROM repe_fund WHERE fund_id = $1::uuid`,
      [fundId]
    ),
    pool
      .query<FundTermRow>(
        `SELECT
           fund_term_id::text AS term_id,
           fund_id::text,
           effective_from AS effective_date,
           preferred_return_rate, carry_rate, waterfall_style,
           management_fee_rate, created_at
         FROM repe_fund_term WHERE fund_id = $1::uuid
         ORDER BY effective_from DESC`,
        [fundId]
      )
      .catch(() => ({ rows: [] as FundTermRow[] })),
  ]);

  const fund = fundRes.rows[0];
  if (!fund) return null;

  return {
    fund,
    terms: termsRes.rows,
  };
}
