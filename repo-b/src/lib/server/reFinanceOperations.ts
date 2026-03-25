import { randomUUID } from "crypto";
import type { Pool, PoolClient } from "pg";
import { resolveBusinessId } from "@/lib/server/db";

type Queryable = Pool | PoolClient;

type RepeFundRecord = {
  repe_fund_id: string;
  fund_name: string;
  vintage_year: number | null;
  strategy: string | null;
  target_size: string | null;
  term_years: number | null;
  pref_rate: string | null;
  carry_rate: string | null;
  waterfall_style: string | null;
};

type FundOption = {
  repe_fund_id: string | null;
  fin_fund_id: string | null;
  fund_name: string;
  fund_code: string | null;
};

type InvestorOption = {
  investor_id: string;
  fin_participant_id: string | null;
  investor_name: string;
  participant_type: string;
};

type FinanceContext = {
  businessId: string;
  tenantId: string | null;
  livePartitionId: string | null;
  repeFunds: RepeFundRecord[];
};

type FundCommitmentRow = {
  fin_fund_id: string;
  repe_fund_id: string | null;
  fin_participant_id: string;
  investor_id: string;
  investor_name: string;
  participant_type: string;
  commitment_role: string;
  committed_amount: number;
};

type CapitalContributionRow = {
  contribution_id: string;
  call_id: string;
  fin_participant_id: string;
  investor_id: string;
  investor_name: string;
  participant_type: string;
  contribution_date: string | null;
  amount_contributed: number;
  status: string;
};

type DistributionPayoutRow = {
  payout_id: string;
  event_id: string;
  fin_participant_id: string;
  investor_id: string;
  investor_name: string;
  participant_type: string;
  payout_type: string;
  amount: number;
  payout_date: string | null;
  event_status: string;
};

type CapitalCallOverviewRow = {
  call_id: string;
  fin_fund_id: string;
  repe_fund_id: string | null;
  fund_name: string;
  fund_code: string | null;
  call_number: number;
  call_label: string;
  call_date: string;
  due_date: string | null;
  requested: string;
  received: string;
  outstanding: string;
  collection_rate: string;
  status: string;
  raw_status: string;
  call_type: string;
  contribution_count: number;
  investor_count: number;
  overdue_investor_count: number;
};

type CapitalCallOverviewResponse = {
  meta: {
    business_id: string;
    live_partition_id: string | null;
    has_data: boolean;
    total_rows: number;
    now_date: string;
  };
  summary: {
    open_calls: number;
    total_requested: string;
    total_received: string;
    collection_rate: string;
    outstanding_balance: string;
    overdue_investors: number;
  };
  lifecycle: Array<{
    key: string;
    label: string;
    count: number;
    amount_total: string;
  }>;
  rows: CapitalCallOverviewRow[];
  options: {
    funds: FundOption[];
    investors: InvestorOption[];
    call_types: string[];
    open_calls: Array<{ call_id: string; label: string }>;
  };
  insights: {
    top_outstanding_investors: Array<{
      investor_id: string;
      investor_name: string;
      participant_type: string;
      outstanding: string;
      call_count: number;
      next_due_date: string | null;
    }>;
    upcoming_due_dates: Array<{
      call_id: string;
      call_label: string;
      fund_name: string;
      due_date: string;
      outstanding: string;
      days_until_due: number;
    }>;
    overdue_watchlist: Array<{
      investor_id: string;
      investor_name: string;
      call_id: string;
      call_label: string;
      fund_name: string;
      due_date: string;
      outstanding: string;
      days_overdue: number;
    }>;
    collection_progress_by_fund: Array<{
      fund_id: string;
      fund_name: string;
      requested: string;
      received: string;
      outstanding: string;
      collection_rate: string;
      open_calls: number;
    }>;
  };
};

type DistributionOverviewRow = {
  event_id: string;
  fin_fund_id: string;
  repe_fund_id: string | null;
  fund_name: string;
  fund_code: string | null;
  event_type: string;
  event_type_label: string;
  distribution_type: string;
  declared_date: string;
  gross_amount: string;
  declared_amount: string;
  allocated_amount: string;
  paid_amount: string;
  pending_amount: string;
  status: string;
  raw_status: string;
  payout_count: number;
  pending_recipient_count: number;
  reference: string | null;
};

type DistributionOverviewResponse = {
  meta: {
    business_id: string;
    live_partition_id: string | null;
    has_data: boolean;
    total_rows: number;
    now_date: string;
    current_quarter: string;
  };
  summary: {
    distribution_events: number;
    total_declared: string;
    total_paid: string;
    pending_amount: string;
    paid_this_quarter: string;
    pending_recipients: number;
  };
  lifecycle: Array<{
    key: string;
    label: string;
    count: number;
    amount_total: string;
  }>;
  rows: DistributionOverviewRow[];
  options: {
    funds: FundOption[];
    investors: InvestorOption[];
    distribution_types: string[];
    pending_events: Array<{ event_id: string; label: string; mode: "waterfall" | "import" }>;
  };
  insights: {
    largest_recipients: Array<{
      investor_id: string;
      investor_name: string;
      participant_type: string;
      allocated_amount: string;
      paid_amount: string;
      event_count: number;
    }>;
    pending_payout_watchlist: Array<{
      event_id: string;
      label: string;
      fund_name: string;
      pending_amount: string;
      pending_recipient_count: number;
      status: string;
    }>;
    recent_distribution_events: Array<{
      event_id: string;
      label: string;
      fund_name: string;
      declared_date: string;
      declared_amount: string;
      status: string;
    }>;
    allocation_mix_by_type: Array<{
      payout_type: string;
      amount: string;
    }>;
  };
};

type CapitalCallDetailResponse = {
  call: Record<string, unknown> | null;
  contributions: Record<string, unknown>[];
  totals: {
    total_contributed: string;
    outstanding: string;
    contribution_count: number;
  };
};

type DistributionDetailResponse = {
  event: Record<string, unknown> | null;
  payouts: Record<string, unknown>[];
  totals: {
    total_payouts: string;
    payout_count: number;
    by_type: Record<string, string>;
  };
};

const DEMO_PARTNERS = [
  { name: "Meridian GP Holdings", partner_type: "gp", ratio: 0.08 },
  { name: "Atlantic State Pension", partner_type: "lp", ratio: 0.39 },
  { name: "North Harbor Endowment", partner_type: "lp", ratio: 0.31 },
  { name: "Harborview Insurance", partner_type: "lp", ratio: 0.22 },
];

const CAPITAL_LIFECYCLE_LABELS: Record<string, string> = {
  issued: "Issued",
  partially_funded: "Partially Funded",
  fully_funded: "Fully Funded",
  overdue: "Overdue",
};

const DISTRIBUTION_LIFECYCLE_LABELS: Record<string, string> = {
  declared: "Declared",
  allocated: "Allocated",
  approved: "Approved",
  paid: "Paid",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  sale: "Sale",
  partial_sale: "Partial Sale",
  refinance: "Refinance",
  operating_distribution: "Operating Distribution",
  other: "Other",
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toMoneyString(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function pickCurrentQuarter(today: Date): string {
  const month = today.getUTCMonth() + 1;
  const quarter = Math.ceil(month / 3);
  return `${today.getUTCFullYear()}Q${quarter}`;
}

function parseDateString(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayDiff(from: Date, to: Date): number {
  const millis = to.getTime() - from.getTime();
  return Math.round(millis / 86_400_000);
}

function buildCallType(purpose: string | null | undefined): string {
  const normalized = (purpose || "").toLowerCase();
  if (!normalized) return "General";
  if (normalized.includes("acquisition") || normalized.includes("closing") || normalized.includes("purchase")) {
    return "Acquisition";
  }
  if (normalized.includes("capex") || normalized.includes("renovation") || normalized.includes("improvement")) {
    return "CapEx";
  }
  if (normalized.includes("debt") || normalized.includes("interest") || normalized.includes("lender")) {
    return "Debt Service";
  }
  if (normalized.includes("reserve") || normalized.includes("working capital") || normalized.includes("operating")) {
    return "Operating Reserve";
  }
  return "General";
}

function buildDistributionType(eventType: string, payoutMix: Map<string, number>): string {
  if (payoutMix.size === 0) {
    return eventType === "operating_distribution" ? "Operating" : "Unallocated";
  }

  const entries = Array.from(payoutMix.entries()).sort((left, right) => right[1] - left[1]);
  const [topType] = entries[0];
  if (entries.length > 1 && topType === "carry") return "Waterfall";
  if (topType === "return_of_capital") return "Return of Capital";
  if (topType === "preferred_return") return "Preferred Return";
  if (topType === "carry" || topType === "catch_up") return "Waterfall";
  if (topType === "fee") return "Fee";
  return "Mixed";
}

function mapPartnerTypeToParticipantType(partnerType: string): string {
  if (partnerType === "lp" || partnerType === "gp") return partnerType;
  return "investor";
}

function buildAllocation(totalAmount: number, rows: Array<{ key: string; weight: number }>): Map<string, number> {
  const cleaned = rows.filter((row) => row.weight > 0);
  if (cleaned.length === 0 || totalAmount <= 0) {
    return new Map(rows.map((row) => [row.key, 0]));
  }

  const totalCents = Math.round(totalAmount * 100);
  const totalWeight = cleaned.reduce((sum, row) => sum + row.weight, 0);
  const allocations = cleaned.map((row) => {
    const exact = (totalCents * row.weight) / totalWeight;
    const cents = Math.floor(exact);
    return {
      key: row.key,
      cents,
      remainder: exact - cents,
    };
  });

  let assigned = allocations.reduce((sum, row) => sum + row.cents, 0);
  let remainder = totalCents - assigned;
  allocations.sort((left, right) => right.remainder - left.remainder);
  for (const row of allocations) {
    if (remainder <= 0) break;
    row.cents += 1;
    remainder -= 1;
    assigned += 1;
  }

  const map = new Map<string, number>();
  for (const row of allocations) {
    map.set(row.key, row.cents / 100);
  }
  for (const row of rows) {
    if (!map.has(row.key)) map.set(row.key, 0);
  }
  return map;
}

async function loadRepeFunds(queryable: Queryable, businessId: string): Promise<RepeFundRecord[]> {
  const result = await queryable.query(
    `SELECT
       f.fund_id::text AS repe_fund_id,
       f.name AS fund_name,
       f.vintage_year,
       COALESCE(f.strategy_type, f.strategy) AS strategy,
       f.target_size::text,
       f.term_years,
       ft.preferred_return_rate::text AS pref_rate,
       ft.carry_rate::text,
       ft.waterfall_style
     FROM repe_fund f
     LEFT JOIN LATERAL (
       SELECT preferred_return_rate, carry_rate, waterfall_style
       FROM repe_fund_term
       WHERE fund_id = f.fund_id
       ORDER BY effective_from DESC
       LIMIT 1
     ) ft ON true
     WHERE f.business_id = $1::uuid
     ORDER BY f.created_at, f.name`,
    [businessId]
  );

  return result.rows as RepeFundRecord[];
}

async function findLivePartition(queryable: Queryable, businessId: string): Promise<{ partition_id: string; tenant_id: string } | null> {
  const result = await queryable.query(
    `SELECT partition_id::text, tenant_id::text
     FROM fin_partition
     WHERE business_id = $1::uuid
       AND partition_type = 'live'
       AND status = 'active'
     ORDER BY created_at
     LIMIT 1`,
    [businessId]
  );
  return (result.rows[0] as { partition_id: string; tenant_id: string } | undefined) || null;
}

async function resolveContext(queryable: Queryable, envId: string | null, explicitBusinessId: string | null): Promise<FinanceContext | null> {
  const businessId = await resolveBusinessId(queryable as Pool, envId, explicitBusinessId);
  if (!businessId) return null;

  const [businessRes, livePartition, repeFunds] = await Promise.all([
    queryable.query(`SELECT tenant_id::text FROM business WHERE business_id = $1::uuid`, [businessId]),
    findLivePartition(queryable, businessId),
    loadRepeFunds(queryable, businessId),
  ]);

  return {
    businessId,
    tenantId: (businessRes.rows[0]?.tenant_id as string | undefined) || null,
    livePartitionId: livePartition?.partition_id || null,
    repeFunds,
  };
}

async function ensureLivePartition(client: PoolClient, businessId: string, tenantId: string | null): Promise<{ partition_id: string; tenant_id: string }> {
  const existing = await findLivePartition(client, businessId);
  if (existing) return existing;

  const resolvedTenantId = tenantId || (
    await client.query(`SELECT tenant_id::text FROM business WHERE business_id = $1::uuid`, [businessId])
  ).rows[0]?.tenant_id;

  if (!resolvedTenantId) {
    throw new Error("Unable to resolve tenant for finance live partition.");
  }

  const inserted = await client.query(
    `INSERT INTO fin_partition
       (tenant_id, business_id, key, partition_type, is_read_only, status)
     VALUES ($1::uuid, $2::uuid, 'live', 'live', false, 'active')
     RETURNING partition_id::text, tenant_id::text`,
    [resolvedTenantId, businessId]
  );

  return inserted.rows[0] as { partition_id: string; tenant_id: string };
}

async function loadFundOptions(queryable: Queryable, context: FinanceContext): Promise<FundOption[]> {
  const financeRows = context.livePartitionId
    ? (
        await queryable.query(
          `SELECT
             ff.fin_fund_id::text,
             ff.fund_code,
             ff.name AS finance_fund_name,
             bridge.repe_fund_id,
             COALESCE(bridge.fund_name, ff.name) AS fund_name
           FROM fin_fund ff
           LEFT JOIN LATERAL (
             SELECT rf.fund_id::text AS repe_fund_id, rf.name AS fund_name
             FROM repe_fund rf
             WHERE rf.business_id = ff.business_id
               AND (ff.fund_code = rf.fund_id::text OR lower(rf.name) = lower(ff.name))
             ORDER BY CASE WHEN ff.fund_code = rf.fund_id::text THEN 0 ELSE 1 END, rf.created_at
             LIMIT 1
           ) bridge ON true
           WHERE ff.business_id = $1::uuid
             AND ff.partition_id = $2::uuid
           ORDER BY fund_name`,
          [context.businessId, context.livePartitionId]
        )
      ).rows
    : [];

  const byRepeFundId = new Map<string, FundOption>();
  const options: FundOption[] = [];

  for (const fund of context.repeFunds) {
    const match = financeRows.find((row) => row.repe_fund_id === fund.repe_fund_id || row.finance_fund_name === fund.fund_name);
    const option: FundOption = {
      repe_fund_id: fund.repe_fund_id,
      fin_fund_id: (match?.fin_fund_id as string | undefined) || null,
      fund_name: fund.fund_name,
      fund_code: (match?.fund_code as string | undefined) || null,
    };
    options.push(option);
    byRepeFundId.set(fund.repe_fund_id, option);
  }

  for (const row of financeRows) {
    if (row.repe_fund_id && byRepeFundId.has(row.repe_fund_id as string)) continue;
    options.push({
      repe_fund_id: (row.repe_fund_id as string | undefined) || null,
      fin_fund_id: row.fin_fund_id as string,
      fund_name: row.fund_name as string,
      fund_code: (row.fund_code as string | undefined) || null,
    });
  }

  return options;
}

async function loadInvestorOptions(queryable: Queryable, businessId: string): Promise<InvestorOption[]> {
  const [partnerRows, participantRows] = await Promise.all([
    queryable.query(
      `SELECT partner_id::text AS investor_id, name AS investor_name, partner_type
       FROM re_partner
       WHERE business_id = $1::uuid
       ORDER BY name`,
      [businessId]
    ),
    queryable.query(
      `SELECT fin_participant_id::text, external_key, name, participant_type
       FROM fin_participant
       WHERE business_id = $1::uuid
       ORDER BY name`,
      [businessId]
    ),
  ]);

  const options: InvestorOption[] = [];
  const seen = new Set<string>();

  for (const row of partnerRows.rows) {
    const match = participantRows.rows.find((participant) => participant.external_key === row.investor_id);
    const option: InvestorOption = {
      investor_id: row.investor_id as string,
      fin_participant_id: (match?.fin_participant_id as string | undefined) || null,
      investor_name: row.investor_name as string,
      participant_type: row.partner_type as string,
    };
    options.push(option);
    seen.add(option.investor_id);
  }

  for (const row of participantRows.rows) {
    const investorId = (row.external_key as string | undefined) || `fin:${row.fin_participant_id as string}`;
    if (seen.has(investorId)) continue;
    options.push({
      investor_id: investorId,
      fin_participant_id: row.fin_participant_id as string,
      investor_name: row.name as string,
      participant_type: row.participant_type as string,
    });
  }

  return options;
}

async function ensureRepeInvestorBaseline(client: PoolClient, businessId: string, repeFunds: RepeFundRecord[]): Promise<void> {
  if (repeFunds.length === 0) return;

  const commitmentCheck = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM re_partner_commitment rpc
     JOIN repe_fund rf ON rf.fund_id = rpc.fund_id
     WHERE rf.business_id = $1::uuid`,
    [businessId]
  );

  if (Number(commitmentCheck.rows[0]?.count || 0) >= 3) {
    return;
  }

  const partnerIds = new Map<string, string>();
  for (const partner of DEMO_PARTNERS) {
    const existing = await client.query(
      `SELECT partner_id::text
       FROM re_partner
       WHERE business_id = $1::uuid
         AND name = $2
       LIMIT 1`,
      [businessId, partner.name]
    );

    const partnerId = (existing.rows[0]?.partner_id as string | undefined) || randomUUID();
    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO re_partner (partner_id, business_id, name, partner_type)
         VALUES ($1::uuid, $2::uuid, $3, $4)`,
        [partnerId, businessId, partner.name, partner.partner_type]
      );
    }
    partnerIds.set(partner.name, partnerId);
  }

  for (const fund of repeFunds.slice(0, 2)) {
    const totalCommitment = Math.max(toNumber(fund.target_size) || 300_000_000, 120_000_000);
    const allocations = buildAllocation(
      totalCommitment,
      DEMO_PARTNERS.map((partner) => ({ key: partner.name, weight: partner.ratio }))
    );

    for (const partner of DEMO_PARTNERS) {
      const amount = allocations.get(partner.name) || 0;
      await client.query(
        `INSERT INTO re_partner_commitment (partner_id, fund_id, committed_amount, commitment_date, status)
         VALUES ($1::uuid, $2::uuid, $3, $4::date, 'active')
         ON CONFLICT (partner_id, fund_id)
         DO UPDATE SET committed_amount = EXCLUDED.committed_amount`,
        [
          partnerIds.get(partner.name),
          fund.repe_fund_id,
          toMoneyString(amount),
          `${Math.max(fund.vintage_year || 2024, 2024)}-01-15`,
        ]
      );
    }
  }
}

async function ensureFundBridge(
  client: PoolClient,
  context: FinanceContext,
  repeFundId: string
): Promise<{ fin_fund_id: string; repe_fund_id: string; fund_name: string }> {
  const fund = context.repeFunds.find((row) => row.repe_fund_id === repeFundId);
  if (!fund) {
    throw new Error("Selected REPE fund was not found.");
  }

  const livePartition = await ensureLivePartition(client, context.businessId, context.tenantId);
  const existing = await client.query(
    `SELECT fin_fund_id::text, name
     FROM fin_fund
     WHERE business_id = $1::uuid
       AND partition_id = $2::uuid
       AND (fund_code = $3 OR lower(name) = lower($4))
     ORDER BY CASE WHEN fund_code = $3 THEN 0 ELSE 1 END, created_at
     LIMIT 1`,
    [context.businessId, livePartition.partition_id, repeFundId, fund.fund_name]
  );

  if (existing.rows[0]) {
    return {
      fin_fund_id: existing.rows[0].fin_fund_id as string,
      repe_fund_id: repeFundId,
      fund_name: existing.rows[0].name as string,
    };
  }

  const entityType = await client.query(
    `SELECT fin_entity_type_id::text
     FROM fin_entity_type
     WHERE key = 'fund'
     LIMIT 1`
  );
  const entityTypeId = entityType.rows[0]?.fin_entity_type_id as string | undefined;
  if (!entityTypeId) {
    throw new Error("Finance entity type 'fund' is not seeded.");
  }

  const entity = await client.query(
    `INSERT INTO fin_entity
       (tenant_id, business_id, partition_id, fin_entity_type_id, code, name, status, currency_code)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, 'active', 'USD')
     ON CONFLICT (tenant_id, business_id, partition_id, code)
     DO UPDATE SET name = EXCLUDED.name
     RETURNING fin_entity_id::text`,
    [livePartition.tenant_id, context.businessId, livePartition.partition_id, entityTypeId, repeFundId, fund.fund_name]
  );

  const financeFund = await client.query(
    `INSERT INTO fin_fund
       (tenant_id, business_id, partition_id, fin_entity_id, fund_code, name, strategy,
        vintage_date, term_years, pref_rate, pref_is_compound, catchup_rate, carry_rate, waterfall_style, status)
     VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7,
       $8::date, $9, $10, false, 1, $11, $12, 'active'
     )
     RETURNING fin_fund_id::text, name`,
    [
      livePartition.tenant_id,
      context.businessId,
      livePartition.partition_id,
      entity.rows[0].fin_entity_id as string,
      repeFundId,
      fund.fund_name,
      fund.strategy || "equity",
      `${fund.vintage_year || 2024}-01-01`,
      fund.term_years,
      fund.pref_rate || "0.08",
      fund.carry_rate || "0.20",
      fund.waterfall_style || "european",
    ]
  );

  return {
    fin_fund_id: financeFund.rows[0].fin_fund_id as string,
    repe_fund_id: repeFundId,
    fund_name: financeFund.rows[0].name as string,
  };
}

async function ensureParticipantBridge(client: PoolClient, businessId: string, investorId: string): Promise<{ fin_participant_id: string; participant_type: string; investor_name: string }> {
  const partnerRow = await client.query(
    `SELECT partner_id::text, name, partner_type
     FROM re_partner
     WHERE business_id = $1::uuid
       AND partner_id = $2::uuid
     LIMIT 1`,
    [businessId, investorId]
  );

  const partner = partnerRow.rows[0];
  if (!partner) {
    throw new Error("Selected investor was not found.");
  }

  const existing = await client.query(
    `SELECT fin_participant_id::text, participant_type, name
     FROM fin_participant
     WHERE business_id = $1::uuid
       AND external_key = $2
     LIMIT 1`,
    [businessId, investorId]
  );

  if (existing.rows[0]) {
    return {
      fin_participant_id: existing.rows[0].fin_participant_id as string,
      participant_type: existing.rows[0].participant_type as string,
      investor_name: existing.rows[0].name as string,
    };
  }

  const tenantRes = await client.query(`SELECT tenant_id::text FROM business WHERE business_id = $1::uuid`, [businessId]);
  const tenantId = tenantRes.rows[0]?.tenant_id as string | undefined;
  if (!tenantId) {
    throw new Error("Unable to resolve tenant for participant bridge.");
  }

  const inserted = await client.query(
    `INSERT INTO fin_participant
       (tenant_id, business_id, external_key, name, participant_type)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5)
     RETURNING fin_participant_id::text, participant_type, name`,
    [tenantId, businessId, investorId, partner.name as string, mapPartnerTypeToParticipantType(partner.partner_type as string)]
  );

  return {
    fin_participant_id: inserted.rows[0].fin_participant_id as string,
    participant_type: inserted.rows[0].participant_type as string,
    investor_name: inserted.rows[0].name as string,
  };
}

async function ensureFinanceCommitmentsForFund(
  client: PoolClient,
  context: FinanceContext,
  repeFundId: string,
  finFundId: string
): Promise<FundCommitmentRow[]> {
  const livePartition = await ensureLivePartition(client, context.businessId, context.tenantId);
  const fundRow = await client.query(
    `SELECT tenant_id::text, business_id::text, partition_id::text
     FROM fin_fund
     WHERE fin_fund_id = $1::uuid
     LIMIT 1`,
    [finFundId]
  );
  const fund = fundRow.rows[0];
  if (!fund) {
    throw new Error("Finance fund bridge was not found.");
  }

  const commitmentsRes = await client.query(
    `SELECT
       rpc.partner_id::text AS investor_id,
       rp.name AS investor_name,
       rp.partner_type AS participant_type,
       rpc.committed_amount::text,
       rpc.commitment_date::text,
       CASE WHEN rp.partner_type = 'gp' THEN 'gp'
            WHEN rp.partner_type = 'co_invest' THEN 'co_invest'
            ELSE 'lp'
       END AS commitment_role
     FROM re_partner_commitment rpc
     JOIN re_partner rp ON rp.partner_id = rpc.partner_id
     WHERE rpc.fund_id = $1::uuid
       AND rpc.status <> 'cancelled'
     ORDER BY rpc.committed_amount DESC, rp.name`,
    [repeFundId]
  );

  const rows: FundCommitmentRow[] = [];
  for (const row of commitmentsRes.rows) {
    const participant = await ensureParticipantBridge(client, context.businessId, row.investor_id as string);
    await client.query(
      `INSERT INTO fin_commitment
         (tenant_id, business_id, partition_id, fin_fund_id, fin_participant_id, commitment_role, commitment_date, committed_amount, currency_code, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7::date, $8, 'USD', 'active')
       ON CONFLICT (tenant_id, business_id, partition_id, fin_fund_id, fin_participant_id)
       DO UPDATE SET
         commitment_role = EXCLUDED.commitment_role,
         commitment_date = EXCLUDED.commitment_date,
         committed_amount = EXCLUDED.committed_amount`,
      [
        fund.tenant_id as string,
        context.businessId,
        livePartition.partition_id,
        finFundId,
        participant.fin_participant_id,
        row.commitment_role as string,
        row.commitment_date as string,
        row.committed_amount as string,
      ]
    );

    rows.push({
      fin_fund_id: finFundId,
      repe_fund_id: repeFundId,
      fin_participant_id: participant.fin_participant_id,
      investor_id: row.investor_id as string,
      investor_name: row.investor_name as string,
      participant_type: row.participant_type as string,
      commitment_role: row.commitment_role as string,
      committed_amount: toNumber(row.committed_amount),
    });
  }

  return rows;
}

async function ensureBridgedFunds(
  client: PoolClient,
  context: FinanceContext,
  repeFundIds: string[]
): Promise<Array<{ fin_fund_id: string; repe_fund_id: string; fund_name: string; commitments: FundCommitmentRow[] }>> {
  const bridged = [];
  for (const repeFundId of repeFundIds) {
    const fund = await ensureFundBridge(client, context, repeFundId);
    const commitments = await ensureFinanceCommitmentsForFund(client, context, repeFundId, fund.fin_fund_id);
    bridged.push({
      ...fund,
      commitments,
    });
  }
  return bridged;
}

async function loadCapitalBaseData(queryable: Queryable, context: FinanceContext) {
  if (!context.livePartitionId) {
    return {
      fundOptions: await loadFundOptions(queryable, context),
      investorOptions: await loadInvestorOptions(queryable, context.businessId),
      calls: [] as any[],
      contributions: [] as CapitalContributionRow[],
      commitments: [] as FundCommitmentRow[],
    };
  }

  const [fundOptions, investorOptions, callRows, contributionRows, commitmentRows] = await Promise.all([
    loadFundOptions(queryable, context),
    loadInvestorOptions(queryable, context.businessId),
    queryable.query(
      `SELECT
         cc.fin_capital_call_id::text AS call_id,
         cc.fin_fund_id::text,
         cc.call_number,
         cc.call_date::text,
         cc.due_date::text,
         cc.amount_requested::text,
         cc.purpose,
         cc.status,
         ff.fund_code,
         COALESCE(bridge.repe_fund_id, NULL) AS repe_fund_id,
         COALESCE(bridge.fund_name, ff.name) AS fund_name
       FROM fin_capital_call cc
       JOIN fin_fund ff ON ff.fin_fund_id = cc.fin_fund_id
       LEFT JOIN LATERAL (
         SELECT rf.fund_id::text AS repe_fund_id, rf.name AS fund_name
         FROM repe_fund rf
         WHERE rf.business_id = ff.business_id
           AND (ff.fund_code = rf.fund_id::text OR lower(rf.name) = lower(ff.name))
         ORDER BY CASE WHEN ff.fund_code = rf.fund_id::text THEN 0 ELSE 1 END, rf.created_at
         LIMIT 1
       ) bridge ON true
       WHERE cc.business_id = $1::uuid
         AND cc.partition_id = $2::uuid
       ORDER BY cc.call_date DESC, cc.call_number DESC`,
      [context.businessId, context.livePartitionId]
    ),
    queryable.query(
      `SELECT
         c.fin_contribution_id::text AS contribution_id,
         c.fin_capital_call_id::text AS call_id,
         c.fin_participant_id::text,
         COALESCE(rp.partner_id::text, fp.external_key, 'fin:' || fp.fin_participant_id::text) AS investor_id,
         COALESCE(rp.name, fp.name) AS investor_name,
         COALESCE(rp.partner_type, fp.participant_type) AS participant_type,
         c.contribution_date::text,
         c.amount_contributed::text,
         c.status
       FROM fin_contribution c
       JOIN fin_participant fp ON fp.fin_participant_id = c.fin_participant_id
       LEFT JOIN re_partner rp
         ON rp.business_id = fp.business_id
        AND fp.external_key = rp.partner_id::text
       WHERE c.business_id = $1::uuid
         AND c.partition_id = $2::uuid`,
      [context.businessId, context.livePartitionId]
    ),
    queryable.query(
      `SELECT
         fc.fin_fund_id::text,
         COALESCE(bridge.repe_fund_id, NULL) AS repe_fund_id,
         fc.fin_participant_id::text,
         COALESCE(rp.partner_id::text, fp.external_key, 'fin:' || fp.fin_participant_id::text) AS investor_id,
         COALESCE(rp.name, fp.name) AS investor_name,
         COALESCE(rp.partner_type, fp.participant_type) AS participant_type,
         fc.commitment_role,
         fc.committed_amount::text
       FROM fin_commitment fc
       JOIN fin_participant fp ON fp.fin_participant_id = fc.fin_participant_id
       JOIN fin_fund ff ON ff.fin_fund_id = fc.fin_fund_id
       LEFT JOIN re_partner rp
         ON rp.business_id = fp.business_id
        AND fp.external_key = rp.partner_id::text
       LEFT JOIN LATERAL (
         SELECT rf.fund_id::text AS repe_fund_id
         FROM repe_fund rf
         WHERE rf.business_id = ff.business_id
           AND (ff.fund_code = rf.fund_id::text OR lower(rf.name) = lower(ff.name))
         ORDER BY CASE WHEN ff.fund_code = rf.fund_id::text THEN 0 ELSE 1 END, rf.created_at
         LIMIT 1
       ) bridge ON true
       WHERE fc.business_id = $1::uuid
         AND fc.partition_id = $2::uuid`,
      [context.businessId, context.livePartitionId]
    ),
  ]);

  return {
    fundOptions,
    investorOptions,
    calls: callRows.rows,
    contributions: contributionRows.rows.map((row) => ({
      contribution_id: row.contribution_id as string,
      call_id: row.call_id as string,
      fin_participant_id: row.fin_participant_id as string,
      investor_id: row.investor_id as string,
      investor_name: row.investor_name as string,
      participant_type: row.participant_type as string,
      contribution_date: (row.contribution_date as string | undefined) || null,
      amount_contributed: toNumber(row.amount_contributed),
      status: row.status as string,
    })),
    commitments: commitmentRows.rows.map((row) => ({
      fin_fund_id: row.fin_fund_id as string,
      repe_fund_id: (row.repe_fund_id as string | undefined) || null,
      fin_participant_id: row.fin_participant_id as string,
      investor_id: row.investor_id as string,
      investor_name: row.investor_name as string,
      participant_type: row.participant_type as string,
      commitment_role: row.commitment_role as string,
      committed_amount: toNumber(row.committed_amount),
    })),
  };
}

async function loadDistributionBaseData(queryable: Queryable, context: FinanceContext) {
  if (!context.livePartitionId) {
    return {
      fundOptions: await loadFundOptions(queryable, context),
      investorOptions: await loadInvestorOptions(queryable, context.businessId),
      events: [] as any[],
      payouts: [] as DistributionPayoutRow[],
      commitments: [] as FundCommitmentRow[],
    };
  }

  const [fundOptions, investorOptions, eventRows, payoutRows, commitmentRows] = await Promise.all([
    loadFundOptions(queryable, context),
    loadInvestorOptions(queryable, context.businessId),
    queryable.query(
      `SELECT
         de.fin_distribution_event_id::text AS event_id,
         de.fin_fund_id::text,
         de.event_date::text,
         de.gross_proceeds::text,
         de.net_distributable::text,
         de.event_type,
         de.reference,
         de.status,
         ff.fund_code,
         COALESCE(bridge.repe_fund_id, NULL) AS repe_fund_id,
         COALESCE(bridge.fund_name, ff.name) AS fund_name
       FROM fin_distribution_event de
       JOIN fin_fund ff ON ff.fin_fund_id = de.fin_fund_id
       LEFT JOIN LATERAL (
         SELECT rf.fund_id::text AS repe_fund_id, rf.name AS fund_name
         FROM repe_fund rf
         WHERE rf.business_id = ff.business_id
           AND (ff.fund_code = rf.fund_id::text OR lower(rf.name) = lower(ff.name))
         ORDER BY CASE WHEN ff.fund_code = rf.fund_id::text THEN 0 ELSE 1 END, rf.created_at
         LIMIT 1
       ) bridge ON true
       WHERE de.business_id = $1::uuid
         AND de.partition_id = $2::uuid
       ORDER BY de.event_date DESC, de.created_at DESC`,
      [context.businessId, context.livePartitionId]
    ),
    queryable.query(
      `SELECT
         dp.fin_distribution_payout_id::text AS payout_id,
         dp.fin_distribution_event_id::text AS event_id,
         dp.fin_participant_id::text,
         COALESCE(rp.partner_id::text, fp.external_key, 'fin:' || fp.fin_participant_id::text) AS investor_id,
         COALESCE(rp.name, fp.name) AS investor_name,
         COALESCE(rp.partner_type, fp.participant_type) AS participant_type,
         dp.payout_type,
         dp.amount::text,
         dp.payout_date::text,
         de.status AS event_status
       FROM fin_distribution_payout dp
       JOIN fin_participant fp ON fp.fin_participant_id = dp.fin_participant_id
       JOIN fin_distribution_event de ON de.fin_distribution_event_id = dp.fin_distribution_event_id
       LEFT JOIN re_partner rp
         ON rp.business_id = fp.business_id
        AND fp.external_key = rp.partner_id::text
       WHERE dp.business_id = $1::uuid
         AND dp.partition_id = $2::uuid`,
      [context.businessId, context.livePartitionId]
    ),
    queryable.query(
      `SELECT
         fc.fin_fund_id::text,
         COALESCE(bridge.repe_fund_id, NULL) AS repe_fund_id,
         fc.fin_participant_id::text,
         COALESCE(rp.partner_id::text, fp.external_key, 'fin:' || fp.fin_participant_id::text) AS investor_id,
         COALESCE(rp.name, fp.name) AS investor_name,
         COALESCE(rp.partner_type, fp.participant_type) AS participant_type,
         fc.commitment_role,
         fc.committed_amount::text
       FROM fin_commitment fc
       JOIN fin_participant fp ON fp.fin_participant_id = fc.fin_participant_id
       JOIN fin_fund ff ON ff.fin_fund_id = fc.fin_fund_id
       LEFT JOIN re_partner rp
         ON rp.business_id = fp.business_id
        AND fp.external_key = rp.partner_id::text
       LEFT JOIN LATERAL (
         SELECT rf.fund_id::text AS repe_fund_id
         FROM repe_fund rf
         WHERE rf.business_id = ff.business_id
           AND (ff.fund_code = rf.fund_id::text OR lower(rf.name) = lower(ff.name))
         ORDER BY CASE WHEN ff.fund_code = rf.fund_id::text THEN 0 ELSE 1 END, rf.created_at
         LIMIT 1
       ) bridge ON true
       WHERE fc.business_id = $1::uuid
         AND fc.partition_id = $2::uuid`,
      [context.businessId, context.livePartitionId]
    ),
  ]);

  return {
    fundOptions,
    investorOptions,
    events: eventRows.rows,
    payouts: payoutRows.rows.map((row) => ({
      payout_id: row.payout_id as string,
      event_id: row.event_id as string,
      fin_participant_id: row.fin_participant_id as string,
      investor_id: row.investor_id as string,
      investor_name: row.investor_name as string,
      participant_type: row.participant_type as string,
      payout_type: row.payout_type as string,
      amount: toNumber(row.amount),
      payout_date: (row.payout_date as string | undefined) || null,
      event_status: row.event_status as string,
    })),
    commitments: commitmentRows.rows.map((row) => ({
      fin_fund_id: row.fin_fund_id as string,
      repe_fund_id: (row.repe_fund_id as string | undefined) || null,
      fin_participant_id: row.fin_participant_id as string,
      investor_id: row.investor_id as string,
      investor_name: row.investor_name as string,
      participant_type: row.participant_type as string,
      commitment_role: row.commitment_role as string,
      committed_amount: toNumber(row.committed_amount),
    })),
  };
}

function matchesDateRange(value: string, fromDate: string | null, toDate: string | null): boolean {
  if (fromDate && value < fromDate) return false;
  if (toDate && value > toDate) return false;
  return true;
}

export async function getCapitalCallsOverview(
  pool: Pool,
  args: {
    envId: string | null;
    businessId: string | null;
    status: string | null;
    fundId: string | null;
    investorId: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    callType: string | null;
  }
): Promise<CapitalCallOverviewResponse> {
  const context = await resolveContext(pool, args.envId, args.businessId);
  if (!context) {
    return {
      meta: {
        business_id: "",
        live_partition_id: null,
        has_data: false,
        total_rows: 0,
        now_date: new Date().toISOString().slice(0, 10),
      },
      summary: {
        open_calls: 0,
        total_requested: "0.00",
        total_received: "0.00",
        collection_rate: "0.0000",
        outstanding_balance: "0.00",
        overdue_investors: 0,
      },
      lifecycle: Object.entries(CAPITAL_LIFECYCLE_LABELS).map(([key, label]) => ({ key, label, count: 0, amount_total: "0.00" })),
      rows: [],
      options: { funds: [], investors: [], call_types: [], open_calls: [] },
      insights: {
        top_outstanding_investors: [],
        upcoming_due_dates: [],
        overdue_watchlist: [],
        collection_progress_by_fund: [],
      },
    };
  }

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const baseData = await loadCapitalBaseData(pool, context);

  const commitmentsByFund = new Map<string, FundCommitmentRow[]>();
  for (const row of baseData.commitments) {
    const bucket = commitmentsByFund.get(row.fin_fund_id) || [];
    bucket.push(row);
    commitmentsByFund.set(row.fin_fund_id, bucket);
  }

  const contributionsByCall = new Map<string, CapitalContributionRow[]>();
  for (const row of baseData.contributions) {
    const bucket = contributionsByCall.get(row.call_id) || [];
    bucket.push(row);
    contributionsByCall.set(row.call_id, bucket);
  }

  const allRows: CapitalCallOverviewRow[] = [];
  const investorOutstanding = new Map<string, { investor_name: string; participant_type: string; outstanding: number; call_ids: Set<string>; next_due_date: string | null }>();
  const overdueWatchlist: Array<{
    investor_id: string;
    investor_name: string;
    call_id: string;
    call_label: string;
    fund_name: string;
    due_date: string;
    outstanding: string;
    days_overdue: number;
  }> = [];
  const collectionByFund = new Map<string, { fund_name: string; requested: number; received: number; outstanding: number; open_calls: number }>();

  for (const call of baseData.calls) {
    const finFundId = call.fin_fund_id as string;
    const commitments = commitmentsByFund.get(finFundId) || [];
    const contributions = contributionsByCall.get(call.call_id as string) || [];
    const requested = toNumber(call.amount_requested);
    const received = contributions.reduce((sum, row) => sum + row.amount_contributed, 0);
    const outstanding = Math.max(requested - received, 0);
    const allocations = buildAllocation(
      requested,
      commitments.map((row) => ({ key: row.fin_participant_id, weight: row.committed_amount }))
    );
    const contributedByInvestor = new Map<string, number>();
    for (const contribution of contributions) {
      contributedByInvestor.set(
        contribution.fin_participant_id,
        (contributedByInvestor.get(contribution.fin_participant_id) || 0) + contribution.amount_contributed
      );
    }

    const dueDate = (call.due_date as string | undefined) || null;
    const isOverdue = dueDate ? dueDate < todayIso && outstanding > 0 : false;
    const status = isOverdue
      ? "overdue"
      : outstanding <= 0.01
        ? "fully_funded"
        : received > 0
          ? "partially_funded"
          : "issued";
    const callType = buildCallType(call.purpose as string | null | undefined);
    const overdueInvestorIds = new Set<string>();

    for (const commitment of commitments) {
      const expected = allocations.get(commitment.fin_participant_id) || 0;
      const contributed = contributedByInvestor.get(commitment.fin_participant_id) || 0;
      const investorOutstandingAmount = Math.max(expected - contributed, 0);
      if (investorOutstandingAmount <= 0.009) continue;
      if (isOverdue && dueDate) {
        overdueInvestorIds.add(commitment.investor_id);
      }
    }

    const row: CapitalCallOverviewRow = {
      call_id: call.call_id as string,
      fin_fund_id: finFundId,
      repe_fund_id: (call.repe_fund_id as string | undefined) || null,
      fund_name: call.fund_name as string,
      fund_code: (call.fund_code as string | undefined) || null,
      call_number: Number(call.call_number),
      call_label: `CC-${String(call.call_number).padStart(2, "0")}`,
      call_date: call.call_date as string,
      due_date: dueDate,
      requested: toMoneyString(requested),
      received: toMoneyString(received),
      outstanding: toMoneyString(outstanding),
      collection_rate: requested > 0 ? clampPercent(received / requested).toFixed(4) : "0.0000",
      status,
      raw_status: call.status as string,
      call_type: callType,
      contribution_count: contributions.length,
      investor_count: commitments.length,
      overdue_investor_count: overdueInvestorIds.size,
    };

    const investorFilterMatch = !args.investorId || commitments.some((commitment) => commitment.investor_id === args.investorId);
    const fundFilterMatch = !args.fundId
      || row.repe_fund_id === args.fundId
      || row.fin_fund_id === args.fundId;
    const statusFilterMatch = !args.status || row.status === args.status;
    const callTypeMatch = !args.callType || row.call_type === args.callType;
    const dateMatch = matchesDateRange(row.call_date, args.dateFrom, args.dateTo);

    if (investorFilterMatch && fundFilterMatch && statusFilterMatch && callTypeMatch && dateMatch) {
      allRows.push(row);

      for (const commitment of commitments) {
        const expected = allocations.get(commitment.fin_participant_id) || 0;
        const contributed = contributedByInvestor.get(commitment.fin_participant_id) || 0;
        const investorOutstandingAmount = Math.max(expected - contributed, 0);
        if (investorOutstandingAmount <= 0.009) continue;

        const current = investorOutstanding.get(commitment.investor_id) || {
          investor_name: commitment.investor_name,
          participant_type: commitment.participant_type,
          outstanding: 0,
          call_ids: new Set<string>(),
          next_due_date: null,
        };
        current.outstanding += investorOutstandingAmount;
        current.call_ids.add(call.call_id as string);
        if (dueDate && (!current.next_due_date || dueDate < current.next_due_date)) {
          current.next_due_date = dueDate;
        }
        investorOutstanding.set(commitment.investor_id, current);

        if (isOverdue && dueDate) {
          overdueWatchlist.push({
            investor_id: commitment.investor_id,
            investor_name: commitment.investor_name,
            call_id: call.call_id as string,
            call_label: `CC-${String(call.call_number).padStart(2, "0")}`,
            fund_name: call.fund_name as string,
            due_date: dueDate,
            outstanding: toMoneyString(investorOutstandingAmount),
            days_overdue: Math.max(dayDiff(parseDateString(dueDate) || today, today), 0),
          });
        }
      }

      const fundBucket = collectionByFund.get(row.fin_fund_id) || {
        fund_name: row.fund_name,
        requested: 0,
        received: 0,
        outstanding: 0,
        open_calls: 0,
      };
      fundBucket.requested += requested;
      fundBucket.received += received;
      fundBucket.outstanding += outstanding;
      if (outstanding > 0.01) fundBucket.open_calls += 1;
      collectionByFund.set(row.fin_fund_id, fundBucket);
    }
  }

  const requestedTotal = allRows.reduce((sum, row) => sum + toNumber(row.requested), 0);
  const receivedTotal = allRows.reduce((sum, row) => sum + toNumber(row.received), 0);
  const outstandingTotal = allRows.reduce((sum, row) => sum + toNumber(row.outstanding), 0);

  const overdueInvestorIds = new Set<string>();
  for (const item of overdueWatchlist) {
    const includedCall = allRows.some((row) => row.call_id === item.call_id);
    if (includedCall) overdueInvestorIds.add(item.investor_id);
  }

  const lifecycle = Object.entries(CAPITAL_LIFECYCLE_LABELS).map(([key, label]) => {
    const rows = allRows.filter((row) => row.status === key);
    return {
      key,
      label,
      count: rows.length,
      amount_total: toMoneyString(rows.reduce((sum, row) => sum + toNumber(row.requested), 0)),
    };
  });

  const upcomingDueDates = allRows
    .filter((row) => row.due_date && row.status !== "overdue" && toNumber(row.outstanding) > 0)
    .map((row) => {
      const dueDate = parseDateString(row.due_date);
      return {
        call_id: row.call_id,
        call_label: row.call_label,
        fund_name: row.fund_name,
        due_date: row.due_date as string,
        outstanding: row.outstanding,
        days_until_due: dueDate ? dayDiff(today, dueDate) : 0,
      };
    })
    .filter((row) => row.days_until_due >= 0)
    .sort((left, right) => left.days_until_due - right.days_until_due)
    .slice(0, 5);

  const topOutstandingInvestors = Array.from(investorOutstanding.entries())
    .map(([investorId, value]) => ({
      investor_id: investorId,
      investor_name: value.investor_name,
      participant_type: value.participant_type,
      outstanding: toMoneyString(value.outstanding),
      call_count: value.call_ids.size,
      next_due_date: value.next_due_date,
    }))
    .sort((left, right) => toNumber(right.outstanding) - toNumber(left.outstanding))
    .slice(0, 6);

  return {
    meta: {
      business_id: context.businessId,
      live_partition_id: context.livePartitionId,
      has_data: allRows.length > 0,
      total_rows: allRows.length,
      now_date: todayIso,
    },
    summary: {
      open_calls: allRows.filter((row) => toNumber(row.outstanding) > 0.01).length,
      total_requested: toMoneyString(requestedTotal),
      total_received: toMoneyString(receivedTotal),
      collection_rate: requestedTotal > 0 ? clampPercent(receivedTotal / requestedTotal).toFixed(4) : "0.0000",
      outstanding_balance: toMoneyString(outstandingTotal),
      overdue_investors: overdueInvestorIds.size,
    },
    lifecycle,
    rows: allRows,
    options: {
      funds: baseData.fundOptions,
      investors: baseData.investorOptions,
      call_types: Array.from(new Set(allRows.map((row) => row.call_type))).sort(),
      open_calls: allRows
        .filter((row) => toNumber(row.outstanding) > 0.01)
        .map((row) => ({
          call_id: row.call_id,
          label: `${row.call_label} · ${row.fund_name}`,
        })),
    },
    insights: {
      top_outstanding_investors: topOutstandingInvestors,
      upcoming_due_dates: upcomingDueDates,
      overdue_watchlist: overdueWatchlist
        .filter((item) => allRows.some((row) => row.call_id === item.call_id))
        .sort((left, right) => toNumber(right.outstanding) - toNumber(left.outstanding))
        .slice(0, 6),
      collection_progress_by_fund: Array.from(collectionByFund.entries())
        .map(([fundId, value]) => ({
          fund_id: fundId,
          fund_name: value.fund_name,
          requested: toMoneyString(value.requested),
          received: toMoneyString(value.received),
          outstanding: toMoneyString(value.outstanding),
          collection_rate: value.requested > 0 ? clampPercent(value.received / value.requested).toFixed(4) : "0.0000",
          open_calls: value.open_calls,
        }))
        .sort((left, right) => toNumber(right.outstanding) - toNumber(left.outstanding))
        .slice(0, 6),
    },
  };
}

export async function getDistributionsOverview(
  pool: Pool,
  args: {
    envId: string | null;
    businessId: string | null;
    status: string | null;
    fundId: string | null;
    investorId: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    eventType: string | null;
    distributionType: string | null;
  }
): Promise<DistributionOverviewResponse> {
  const context = await resolveContext(pool, args.envId, args.businessId);
  const emptyNow = new Date();
  const emptyIso = emptyNow.toISOString().slice(0, 10);
  if (!context) {
    return {
      meta: {
        business_id: "",
        live_partition_id: null,
        has_data: false,
        total_rows: 0,
        now_date: emptyIso,
        current_quarter: pickCurrentQuarter(emptyNow),
      },
      summary: {
        distribution_events: 0,
        total_declared: "0.00",
        total_paid: "0.00",
        pending_amount: "0.00",
        paid_this_quarter: "0.00",
        pending_recipients: 0,
      },
      lifecycle: Object.entries(DISTRIBUTION_LIFECYCLE_LABELS).map(([key, label]) => ({ key, label, count: 0, amount_total: "0.00" })),
      rows: [],
      options: { funds: [], investors: [], distribution_types: [], pending_events: [] },
      insights: {
        largest_recipients: [],
        pending_payout_watchlist: [],
        recent_distribution_events: [],
        allocation_mix_by_type: [],
      },
    };
  }

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const currentQuarter = pickCurrentQuarter(today);
  const quarterPrefix = currentQuarter.slice(0, 4);
  const quarterSuffix = Number(currentQuarter.slice(-1));
  const quarterStartMonth = (quarterSuffix - 1) * 3 + 1;
  const quarterStart = `${quarterPrefix}-${String(quarterStartMonth).padStart(2, "0")}-01`;
  const quarterEndMonth = quarterStartMonth + 2;
  const quarterEnd = `${quarterPrefix}-${String(quarterEndMonth).padStart(2, "0")}-31`;

  const baseData = await loadDistributionBaseData(pool, context);

  const commitmentsByFund = new Map<string, FundCommitmentRow[]>();
  for (const row of baseData.commitments) {
    const bucket = commitmentsByFund.get(row.fin_fund_id) || [];
    bucket.push(row);
    commitmentsByFund.set(row.fin_fund_id, bucket);
  }

  const payoutsByEvent = new Map<string, DistributionPayoutRow[]>();
  for (const row of baseData.payouts) {
    const bucket = payoutsByEvent.get(row.event_id) || [];
    bucket.push(row);
    payoutsByEvent.set(row.event_id, bucket);
  }

  const recipientRollup = new Map<string, { investor_name: string; participant_type: string; allocated_amount: number; paid_amount: number; event_ids: Set<string> }>();
  const allocationMix = new Map<string, number>();
  const rows: DistributionOverviewRow[] = [];

  for (const event of baseData.events) {
    const payouts = payoutsByEvent.get(event.event_id as string) || [];
    const commitments = commitmentsByFund.get(event.fin_fund_id as string) || [];
    const payoutMix = new Map<string, number>();
    let allocatedAmount = 0;

    for (const payout of payouts) {
      allocatedAmount += payout.amount;
      payoutMix.set(payout.payout_type, (payoutMix.get(payout.payout_type) || 0) + payout.amount);
    }

    const declaredAmount = toNumber(event.net_distributable);
    // Treat both "processed" and "paid" as fully paid.
    // When payout rows are absent (allocatedAmount === 0), fall back to declared_amount
    // so the Total Paid KPI reflects actual cash movement rather than showing $0.
    const isPaid = (event.status as string) === "processed" || (event.status as string) === "paid";
    const paidAmount = isPaid
      ? (allocatedAmount > 0 ? allocatedAmount : declaredAmount)
      : 0;
    const pendingAmount = Math.max(declaredAmount - paidAmount, 0);
    const distributionType = buildDistributionType(event.event_type as string, payoutMix);
    const status = isPaid
      ? "paid"
      : allocatedAmount <= 0.01
        ? "declared"
        : allocatedAmount + 0.01 < declaredAmount
          ? "allocated"
          : "approved";

    const row: DistributionOverviewRow = {
      event_id: event.event_id as string,
      fin_fund_id: event.fin_fund_id as string,
      repe_fund_id: (event.repe_fund_id as string | undefined) || null,
      fund_name: event.fund_name as string,
      fund_code: (event.fund_code as string | undefined) || null,
      event_type: event.event_type as string,
      event_type_label: EVENT_TYPE_LABELS[event.event_type as string] || (event.event_type as string),
      distribution_type: distributionType,
      declared_date: event.event_date as string,
      gross_amount: toMoneyString(toNumber(event.gross_proceeds)),
      declared_amount: toMoneyString(declaredAmount),
      allocated_amount: toMoneyString(allocatedAmount),
      paid_amount: toMoneyString(paidAmount),
      pending_amount: toMoneyString(pendingAmount),
      status,
      raw_status: event.status as string,
      payout_count: payouts.length,
      pending_recipient_count: status === "paid" ? 0 : commitments.length,
      reference: (event.reference as string | undefined) || null,
    };

    const investorFilterMatch = !args.investorId
      || payouts.some((payout) => payout.investor_id === args.investorId)
      || commitments.some((commitment) => commitment.investor_id === args.investorId);
    const fundFilterMatch = !args.fundId
      || row.repe_fund_id === args.fundId
      || row.fin_fund_id === args.fundId;
    const statusFilterMatch = !args.status || row.status === args.status;
    const eventTypeMatch = !args.eventType || row.event_type === args.eventType;
    const distributionTypeMatch = !args.distributionType || row.distribution_type === args.distributionType;
    const dateMatch = matchesDateRange(row.declared_date, args.dateFrom, args.dateTo);

    if (investorFilterMatch && fundFilterMatch && statusFilterMatch && eventTypeMatch && distributionTypeMatch && dateMatch) {
      rows.push(row);
      for (const payout of payouts) {
        allocationMix.set(payout.payout_type, (allocationMix.get(payout.payout_type) || 0) + payout.amount);
        const rollup = recipientRollup.get(payout.investor_id) || {
          investor_name: payout.investor_name,
          participant_type: payout.participant_type,
          allocated_amount: 0,
          paid_amount: 0,
          event_ids: new Set<string>(),
        };
        rollup.allocated_amount += payout.amount;
        if ((event.status as string) === "processed") {
          rollup.paid_amount += payout.amount;
        }
        rollup.event_ids.add(event.event_id as string);
        recipientRollup.set(payout.investor_id, rollup);
      }
    }
  }

  const totalDeclared = rows.reduce((sum, row) => sum + toNumber(row.declared_amount), 0);
  const totalPaid = rows.reduce((sum, row) => sum + toNumber(row.paid_amount), 0);
  const totalPending = rows.reduce((sum, row) => sum + toNumber(row.pending_amount), 0);
  const paidThisQuarter = rows
    .filter((row) => row.status === "paid" && row.declared_date >= quarterStart && row.declared_date <= quarterEnd)
    .reduce((sum, row) => sum + toNumber(row.paid_amount), 0);

  return {
    meta: {
      business_id: context.businessId,
      live_partition_id: context.livePartitionId,
      has_data: rows.length > 0,
      total_rows: rows.length,
      now_date: todayIso,
      current_quarter: currentQuarter,
    },
    summary: {
      distribution_events: rows.length,
      total_declared: toMoneyString(totalDeclared),
      total_paid: toMoneyString(totalPaid),
      pending_amount: toMoneyString(totalPending),
      paid_this_quarter: toMoneyString(paidThisQuarter),
      pending_recipients: Array.from(new Set(
        rows
          .filter((row) => row.status !== "paid")
          .flatMap((row) => (commitmentsByFund.get(row.fin_fund_id) || []).map((commitment) => commitment.investor_id))
      )).length,
    },
    lifecycle: Object.entries(DISTRIBUTION_LIFECYCLE_LABELS).map(([key, label]) => {
      const lifecycleRows = rows.filter((row) => row.status === key);
      return {
        key,
        label,
        count: lifecycleRows.length,
        amount_total: toMoneyString(lifecycleRows.reduce((sum, row) => sum + toNumber(row.declared_amount), 0)),
      };
    }),
    rows,
    options: {
      funds: baseData.fundOptions,
      investors: baseData.investorOptions,
      distribution_types: Array.from(new Set(rows.map((row) => row.distribution_type))).sort(),
      pending_events: rows
        .filter((row) => row.raw_status === "pending")
        .map((row) => ({
          event_id: row.event_id,
          label: `${row.event_type_label} · ${row.fund_name} · ${row.declared_date}`,
          mode: toNumber(row.allocated_amount) <= 0.01 ? "waterfall" as const : "import" as const,
        })),
    },
    insights: {
      largest_recipients: Array.from(recipientRollup.entries())
        .map(([investorId, value]) => ({
          investor_id: investorId,
          investor_name: value.investor_name,
          participant_type: value.participant_type,
          allocated_amount: toMoneyString(value.allocated_amount),
          paid_amount: toMoneyString(value.paid_amount),
          event_count: value.event_ids.size,
        }))
        .sort((left, right) => toNumber(right.allocated_amount) - toNumber(left.allocated_amount))
        .slice(0, 6),
      pending_payout_watchlist: rows
        .filter((row) => toNumber(row.pending_amount) > 0.01)
        .map((row) => ({
          event_id: row.event_id,
          label: `${row.event_type_label} · ${row.declared_date}`,
          fund_name: row.fund_name,
          pending_amount: row.pending_amount,
          pending_recipient_count: row.pending_recipient_count,
          status: row.status,
        }))
        .sort((left, right) => toNumber(right.pending_amount) - toNumber(left.pending_amount))
        .slice(0, 6),
      recent_distribution_events: [...rows]
        .sort((left, right) => right.declared_date.localeCompare(left.declared_date))
        .slice(0, 6)
        .map((row) => ({
          event_id: row.event_id,
          label: `${row.event_type_label}${row.reference ? ` · ${row.reference}` : ""}`,
          fund_name: row.fund_name,
          declared_date: row.declared_date,
          declared_amount: row.declared_amount,
          status: row.status,
        })),
      allocation_mix_by_type: Array.from(allocationMix.entries())
        .map(([payoutType, amount]) => ({ payout_type: payoutType, amount: toMoneyString(amount) }))
        .sort((left, right) => toNumber(right.amount) - toNumber(left.amount)),
    },
  };
}

async function insertCapitalCall(
  client: PoolClient,
  finFundId: string,
  payload: { call_date: string; due_date: string | null; amount_requested: string; purpose: string | null; status?: string | null }
): Promise<string> {
  const fundRes = await client.query(
    `SELECT tenant_id::text, business_id::text, partition_id::text
     FROM fin_fund
     WHERE fin_fund_id = $1::uuid
     LIMIT 1`,
    [finFundId]
  );
  const fund = fundRes.rows[0];
  if (!fund) {
    throw new Error("Finance fund not found for capital call.");
  }

  const nextCall = await client.query(
    `SELECT COALESCE(MAX(call_number), 0) + 1 AS next_number
     FROM fin_capital_call
     WHERE fin_fund_id = $1::uuid`,
    [finFundId]
  );

  const inserted = await client.query(
    `INSERT INTO fin_capital_call
       (tenant_id, business_id, partition_id, fin_fund_id, call_number, call_date, due_date, amount_requested, purpose, status)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::date, $7::date, $8, $9, $10)
     RETURNING fin_capital_call_id::text`,
    [
      fund.tenant_id as string,
      fund.business_id as string,
      fund.partition_id as string,
      finFundId,
      Number(nextCall.rows[0]?.next_number || 1),
      payload.call_date,
      payload.due_date,
      payload.amount_requested,
      payload.purpose,
      payload.status || "issued",
    ]
  );

  return inserted.rows[0].fin_capital_call_id as string;
}

async function insertContribution(
  client: PoolClient,
  finFundId: string,
  callId: string,
  finParticipantId: string,
  amount: number,
  contributionDate: string
): Promise<void> {
  if (amount <= 0.009) return;

  const fundRes = await client.query(
    `SELECT tenant_id::text, business_id::text, partition_id::text
     FROM fin_fund
     WHERE fin_fund_id = $1::uuid
     LIMIT 1`,
    [finFundId]
  );
  const fund = fundRes.rows[0];
  if (!fund) {
    throw new Error("Finance fund not found for contribution import.");
  }

  await client.query(
    `INSERT INTO fin_contribution
       (tenant_id, business_id, partition_id, fin_fund_id, fin_capital_call_id, fin_participant_id, contribution_date, amount_contributed, status)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::date, $8, 'collected')`,
    [
      fund.tenant_id as string,
      fund.business_id as string,
      fund.partition_id as string,
      finFundId,
      callId,
      finParticipantId,
      contributionDate,
      toMoneyString(amount),
    ]
  );
}

async function insertDistributionEvent(
  client: PoolClient,
  finFundId: string,
  payload: { event_date: string; gross_proceeds: string; net_distributable: string; event_type: string; reference: string | null; status?: string | null }
): Promise<string> {
  const fundRes = await client.query(
    `SELECT tenant_id::text, business_id::text, partition_id::text
     FROM fin_fund
     WHERE fin_fund_id = $1::uuid
     LIMIT 1`,
    [finFundId]
  );
  const fund = fundRes.rows[0];
  if (!fund) {
    throw new Error("Finance fund not found for distribution event.");
  }

  const inserted = await client.query(
    `INSERT INTO fin_distribution_event
       (tenant_id, business_id, partition_id, fin_fund_id, event_date, gross_proceeds, net_distributable, event_type, reference, status)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::date, $6, $7, $8, $9, $10)
     RETURNING fin_distribution_event_id::text`,
    [
      fund.tenant_id as string,
      fund.business_id as string,
      fund.partition_id as string,
      finFundId,
      payload.event_date,
      payload.gross_proceeds,
      payload.net_distributable,
      payload.event_type,
      payload.reference,
      payload.status || "pending",
    ]
  );

  return inserted.rows[0].fin_distribution_event_id as string;
}

async function insertDistributionPayout(
  client: PoolClient,
  eventId: string,
  finFundId: string,
  finParticipantId: string,
  payoutType: string,
  amount: number,
  payoutDate: string
): Promise<void> {
  if (amount <= 0.009) return;

  const fundRes = await client.query(
    `SELECT tenant_id::text, business_id::text, partition_id::text
     FROM fin_fund
     WHERE fin_fund_id = $1::uuid
     LIMIT 1`,
    [finFundId]
  );
  const fund = fundRes.rows[0];
  if (!fund) {
    throw new Error("Finance fund not found for payout import.");
  }

  await client.query(
    `INSERT INTO fin_distribution_payout
       (tenant_id, business_id, partition_id, fin_fund_id, fin_distribution_event_id, fin_participant_id, payout_type, amount, payout_date, currency_code)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7, $8, $9::date, 'USD')`,
    [
      fund.tenant_id as string,
      fund.business_id as string,
      fund.partition_id as string,
      finFundId,
      eventId,
      finParticipantId,
      payoutType,
      toMoneyString(amount),
      payoutDate,
    ]
  );
}

export async function createCapitalCallAction(
  pool: Pool,
  payload: {
    envId: string | null;
    businessId: string | null;
    repeFundId: string;
    callDate: string;
    dueDate: string | null;
    amountRequested: string;
    callType: string | null;
    purpose: string | null;
  }
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const context = await resolveContext(client, payload.envId, payload.businessId);
    if (!context) throw new Error("Unable to resolve REPE business context.");
    await ensureRepeInvestorBaseline(client, context.businessId, context.repeFunds);
    const fund = await ensureFundBridge(client, context, payload.repeFundId);
    await ensureFinanceCommitmentsForFund(client, context, payload.repeFundId, fund.fin_fund_id);

    const purpose = payload.callType
      ? `${payload.callType}: ${payload.purpose || "New capital call"}`
      : (payload.purpose || "New capital call");
    const callId = await insertCapitalCall(client, fund.fin_fund_id, {
      call_date: payload.callDate,
      due_date: payload.dueDate,
      amount_requested: payload.amountRequested,
      purpose,
      status: "issued",
    });

    await client.query("COMMIT");
    return { call_id: callId, fin_fund_id: fund.fin_fund_id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function importCapitalCallContributionsAction(
  pool: Pool,
  payload: {
    callId: string;
    contributionDate: string;
    collectionRate: number;
  }
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const callRes = await client.query(
      `SELECT fin_capital_call_id::text AS call_id, fin_fund_id::text, amount_requested::text
       FROM fin_capital_call
       WHERE fin_capital_call_id = $1::uuid
       LIMIT 1`,
      [payload.callId]
    );
    const call = callRes.rows[0];
    if (!call) throw new Error("Capital call not found.");

    const commitmentsRes = await client.query(
      `SELECT fin_participant_id::text, committed_amount::text
       FROM fin_commitment
       WHERE fin_fund_id = $1::uuid
       ORDER BY committed_amount DESC`,
      [call.fin_fund_id as string]
    );
    if (commitmentsRes.rows.length === 0) {
      throw new Error("This fund has no investor commitments to import.");
    }

    const contributionsRes = await client.query(
      `SELECT fin_participant_id::text, COALESCE(SUM(amount_contributed), 0)::text AS total_amount
       FROM fin_contribution
       WHERE fin_capital_call_id = $1::uuid
       GROUP BY fin_participant_id`,
      [payload.callId]
    );
    const existingByInvestor = new Map<string, number>();
    for (const row of contributionsRes.rows) {
      existingByInvestor.set(row.fin_participant_id as string, toNumber(row.total_amount));
    }

    const requested = toNumber(call.amount_requested);
    const targetReceived = requested * clampPercent(payload.collectionRate);
    const existingReceived = Array.from(existingByInvestor.values()).reduce((sum, value) => sum + value, 0);
    const remainingToImport = Math.max(targetReceived - existingReceived, 0);

    const expectedByInvestor = buildAllocation(
      requested,
      commitmentsRes.rows.map((row) => ({ key: row.fin_participant_id as string, weight: toNumber(row.committed_amount) }))
    );
    const remainingWeights = commitmentsRes.rows.map((row) => {
      const participantId = row.fin_participant_id as string;
      const expected = expectedByInvestor.get(participantId) || 0;
      const remaining = Math.max(expected - (existingByInvestor.get(participantId) || 0), 0);
      return { key: participantId, weight: remaining };
    });
    const importByInvestor = buildAllocation(remainingToImport, remainingWeights);

    for (const row of commitmentsRes.rows) {
      const participantId = row.fin_participant_id as string;
      const amount = importByInvestor.get(participantId) || 0;
      await insertContribution(client, call.fin_fund_id as string, payload.callId, participantId, amount, payload.contributionDate);
    }

    const updatedReceived = existingReceived + remainingToImport;
    await client.query(
      `UPDATE fin_capital_call
       SET status = CASE WHEN $2::numeric >= amount_requested THEN 'closed' ELSE status END
       WHERE fin_capital_call_id = $1::uuid`,
      [payload.callId, toMoneyString(updatedReceived)]
    );

    await client.query("COMMIT");
    return {
      call_id: payload.callId,
      imported_amount: toMoneyString(remainingToImport),
      collection_rate: clampPercent(payload.collectionRate).toFixed(4),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createDistributionAction(
  pool: Pool,
  payload: {
    envId: string | null;
    businessId: string | null;
    repeFundId: string;
    eventDate: string;
    grossProceeds: string;
    netDistributable: string;
    eventType: string;
    reference: string | null;
  }
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const context = await resolveContext(client, payload.envId, payload.businessId);
    if (!context) throw new Error("Unable to resolve REPE business context.");
    await ensureRepeInvestorBaseline(client, context.businessId, context.repeFunds);
    const fund = await ensureFundBridge(client, context, payload.repeFundId);
    await ensureFinanceCommitmentsForFund(client, context, payload.repeFundId, fund.fin_fund_id);

    const eventId = await insertDistributionEvent(client, fund.fin_fund_id, {
      event_date: payload.eventDate,
      gross_proceeds: payload.grossProceeds,
      net_distributable: payload.netDistributable,
      event_type: payload.eventType,
      reference: payload.reference,
      status: "pending",
    });

    await client.query("COMMIT");
    return { event_id: eventId, fin_fund_id: fund.fin_fund_id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function importDistributionPayoutsAction(
  pool: Pool,
  payload: {
    eventId: string;
    payoutType: string;
    allocationRate: number;
    markPaid: boolean;
  }
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const eventRes = await client.query(
      `SELECT fin_distribution_event_id::text AS event_id, fin_fund_id::text, event_date::text, net_distributable::text
       FROM fin_distribution_event
       WHERE fin_distribution_event_id = $1::uuid
       LIMIT 1`,
      [payload.eventId]
    );
    const event = eventRes.rows[0];
    if (!event) throw new Error("Distribution event not found.");

    const commitmentsRes = await client.query(
      `SELECT fin_participant_id::text, committed_amount::text
       FROM fin_commitment
       WHERE fin_fund_id = $1::uuid
       ORDER BY committed_amount DESC`,
      [event.fin_fund_id as string]
    );
    if (commitmentsRes.rows.length === 0) {
      throw new Error("This fund has no investor commitments to allocate.");
    }

    const payoutRes = await client.query(
      `SELECT fin_participant_id::text, COALESCE(SUM(amount), 0)::text AS total_amount
       FROM fin_distribution_payout
       WHERE fin_distribution_event_id = $1::uuid
       GROUP BY fin_participant_id`,
      [payload.eventId]
    );
    const existingByInvestor = new Map<string, number>();
    let existingTotal = 0;
    for (const row of payoutRes.rows) {
      const totalAmount = toNumber(row.total_amount);
      existingByInvestor.set(row.fin_participant_id as string, totalAmount);
      existingTotal += totalAmount;
    }

    const desiredTotal = toNumber(event.net_distributable) * clampPercent(payload.allocationRate);
    const remainingToImport = Math.max(desiredTotal - existingTotal, 0);
    const allocations = buildAllocation(
      toNumber(event.net_distributable),
      commitmentsRes.rows.map((row) => ({ key: row.fin_participant_id as string, weight: toNumber(row.committed_amount) }))
    );
    const remainingWeights = commitmentsRes.rows.map((row) => {
      const participantId = row.fin_participant_id as string;
      const expected = allocations.get(participantId) || 0;
      const remaining = Math.max(expected - (existingByInvestor.get(participantId) || 0), 0);
      return { key: participantId, weight: remaining };
    });
    const importByInvestor = buildAllocation(remainingToImport, remainingWeights);

    for (const row of commitmentsRes.rows) {
      const participantId = row.fin_participant_id as string;
      await insertDistributionPayout(
        client,
        payload.eventId,
        event.fin_fund_id as string,
        participantId,
        payload.payoutType,
        importByInvestor.get(participantId) || 0,
        event.event_date as string
      );
    }

    const finalAllocated = existingTotal + remainingToImport;
    if (payload.markPaid && finalAllocated + 0.01 >= toNumber(event.net_distributable)) {
      await client.query(
        `UPDATE fin_distribution_event
         SET status = 'processed'
         WHERE fin_distribution_event_id = $1::uuid`,
        [payload.eventId]
      );
    }

    await client.query("COMMIT");
    return {
      event_id: payload.eventId,
      imported_amount: toMoneyString(remainingToImport),
      final_allocated: toMoneyString(finalAllocated),
      marked_paid: payload.markPaid && finalAllocated + 0.01 >= toNumber(event.net_distributable),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function seedCapitalCallsDemo(pool: Pool, payload: { envId: string | null; businessId: string | null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const context = await resolveContext(client, payload.envId, payload.businessId);
    if (!context) throw new Error("Unable to resolve REPE business context.");
    await ensureRepeInvestorBaseline(client, context.businessId, context.repeFunds);
    if (context.repeFunds.length === 0) {
      throw new Error("Seed demo data requires at least one REPE fund in this workspace.");
    }

    const livePartition = await ensureLivePartition(client, context.businessId, context.tenantId);
    const existingCalls = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM fin_capital_call
       WHERE business_id = $1::uuid
         AND partition_id = $2::uuid`,
      [context.businessId, livePartition.partition_id]
    );
    if (Number(existingCalls.rows[0]?.count || 0) > 0) {
      await client.query("COMMIT");
      return { seeded: false, created_calls: 0, reason: "existing_data" };
    }

    const targetFunds = context.repeFunds.slice(0, Math.min(context.repeFunds.length, 2));
    const bridgedFunds = await ensureBridgedFunds(client, context, targetFunds.map((fund) => fund.repe_fund_id));
    const seedSpecs = [
      { fundIndex: 0, issueDate: "2026-01-15", dueDate: "2026-01-31", requestPct: 0.03, collectPct: 1, purpose: "Acquisition closing capital", status: "closed" },
      { fundIndex: 0, issueDate: "2026-03-05", dueDate: "2026-03-24", requestPct: 0.042, collectPct: 0.67, purpose: "CapEx and lease-up reserve", status: "issued" },
      { fundIndex: Math.min(1, bridgedFunds.length - 1), issueDate: "2026-01-10", dueDate: "2026-02-05", requestPct: 0.028, collectPct: 0.28, purpose: "Operating reserve and debt service", status: "issued" },
      { fundIndex: Math.min(1, bridgedFunds.length - 1), issueDate: "2026-03-12", dueDate: "2026-04-02", requestPct: 0.018, collectPct: 0, purpose: "Working capital reserve", status: "issued" },
    ];

    let createdCalls = 0;
    for (const spec of seedSpecs) {
      const fund = bridgedFunds[spec.fundIndex];
      if (!fund) continue;
      const totalCommitment = fund.commitments.reduce((sum, row) => sum + row.committed_amount, 0);
      const requested = Math.max(totalCommitment * spec.requestPct, 1_500_000);
      const callId = await insertCapitalCall(client, fund.fin_fund_id, {
        call_date: spec.issueDate,
        due_date: spec.dueDate,
        amount_requested: toMoneyString(requested),
        purpose: spec.purpose,
        status: spec.status,
      });
      createdCalls += 1;

      const expectedAllocations = buildAllocation(
        requested,
        fund.commitments.map((row) => ({ key: row.fin_participant_id, weight: row.committed_amount }))
      );
      const receivedAllocations = buildAllocation(
        requested * spec.collectPct,
        fund.commitments.map((row) => ({ key: row.fin_participant_id, weight: row.committed_amount }))
      );

      for (const commitment of fund.commitments) {
        const amount = Math.min(receivedAllocations.get(commitment.fin_participant_id) || 0, expectedAllocations.get(commitment.fin_participant_id) || 0);
        await insertContribution(client, fund.fin_fund_id, callId, commitment.fin_participant_id, amount, spec.issueDate);
      }
    }

    await client.query("COMMIT");
    return { seeded: true, created_calls: createdCalls };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function seedDistributionsDemo(pool: Pool, payload: { envId: string | null; businessId: string | null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const context = await resolveContext(client, payload.envId, payload.businessId);
    if (!context) throw new Error("Unable to resolve REPE business context.");
    await ensureRepeInvestorBaseline(client, context.businessId, context.repeFunds);
    if (context.repeFunds.length === 0) {
      throw new Error("Seed demo data requires at least one REPE fund in this workspace.");
    }

    const livePartition = await ensureLivePartition(client, context.businessId, context.tenantId);
    const existingEvents = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM fin_distribution_event
       WHERE business_id = $1::uuid
         AND partition_id = $2::uuid`,
      [context.businessId, livePartition.partition_id]
    );
    if (Number(existingEvents.rows[0]?.count || 0) > 0) {
      await client.query("COMMIT");
      return { seeded: false, created_events: 0, reason: "existing_data" };
    }

    const targetFunds = context.repeFunds.slice(0, Math.min(context.repeFunds.length, 2));
    const bridgedFunds = await ensureBridgedFunds(client, context, targetFunds.map((fund) => fund.repe_fund_id));

    const seedSpecs = [
      { fundIndex: 0, eventDate: "2026-02-28", grossPct: 0.02, netPct: 0.0185, eventType: "operating_distribution", reference: "Q1 operating cash release", payoutMode: "paid" as const, payoutRate: 1, payoutMix: { return_of_capital: 0.75, preferred_return: 0.2, carry: 0.05 } },
      { fundIndex: 0, eventDate: "2026-03-10", grossPct: 0.03, netPct: 0.025, eventType: "refinance", reference: "Refi proceeds allocation", payoutMode: "approved" as const, payoutRate: 1, payoutMix: { return_of_capital: 0.65, preferred_return: 0.2, carry: 0.15 } },
      { fundIndex: Math.min(1, bridgedFunds.length - 1), eventDate: "2026-03-14", grossPct: 0.042, netPct: 0.034, eventType: "sale", reference: "Partial realization", payoutMode: "allocated" as const, payoutRate: 0.45, payoutMix: { return_of_capital: 0.6, preferred_return: 0.25, carry: 0.15 } },
      { fundIndex: Math.min(1, bridgedFunds.length - 1), eventDate: "2026-03-16", grossPct: 0.012, netPct: 0.0105, eventType: "operating_distribution", reference: "Declared cash movement", payoutMode: "declared" as const, payoutRate: 0, payoutMix: { return_of_capital: 1 } },
    ];

    let createdEvents = 0;
    for (const spec of seedSpecs) {
      const fund = bridgedFunds[spec.fundIndex];
      if (!fund) continue;
      const totalCommitment = fund.commitments.reduce((sum, row) => sum + row.committed_amount, 0);
      const grossAmount = Math.max(totalCommitment * spec.grossPct, 900_000);
      const netAmount = Math.max(totalCommitment * spec.netPct, 750_000);
      const status = spec.payoutMode === "paid" ? "processed" : "pending";
      const eventId = await insertDistributionEvent(client, fund.fin_fund_id, {
        event_date: spec.eventDate,
        gross_proceeds: toMoneyString(grossAmount),
        net_distributable: toMoneyString(netAmount),
        event_type: spec.eventType,
        reference: spec.reference,
        status,
      });
      createdEvents += 1;

      const allocatedTotal = netAmount * spec.payoutRate;
      const typeAllocations = buildAllocation(
        allocatedTotal,
        Object.entries(spec.payoutMix).map(([key, weight]) => ({ key, weight }))
      );

      for (const [payoutType, payoutAmount] of typeAllocations.entries()) {
        const investorAllocations = buildAllocation(
          payoutAmount,
          fund.commitments.map((row) => ({ key: row.fin_participant_id, weight: row.committed_amount }))
        );
        for (const commitment of fund.commitments) {
          await insertDistributionPayout(
            client,
            eventId,
            fund.fin_fund_id,
            commitment.fin_participant_id,
            payoutType,
            investorAllocations.get(commitment.fin_participant_id) || 0,
            spec.eventDate
          );
        }
      }
    }

    await client.query("COMMIT");
    return { seeded: true, created_events: createdEvents };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getCapitalCallDetail(pool: Pool, callId: string): Promise<CapitalCallDetailResponse> {
  const callRes = await pool.query(
    `SELECT
       cc.fin_capital_call_id::text AS call_id,
       cc.fin_fund_id::text AS fund_id,
       ff.name AS fund_name,
       cc.call_number,
       cc.call_date::text,
       cc.due_date::text,
       cc.amount_requested::text,
       cc.purpose,
       cc.status,
       cc.created_at::text
     FROM fin_capital_call cc
     JOIN fin_fund ff ON ff.fin_fund_id = cc.fin_fund_id
     WHERE cc.fin_capital_call_id = $1::uuid
     LIMIT 1`,
    [callId]
  );
  const call = callRes.rows[0];
  if (!call) {
    return {
      call: null,
      contributions: [],
      totals: {
        total_contributed: "0.00",
        outstanding: "0.00",
        contribution_count: 0,
      },
    };
  }

  const contributionsRes = await pool.query(
    `SELECT
       c.fin_contribution_id::text AS contribution_id,
       c.fin_capital_call_id::text AS call_id,
       COALESCE(rp.partner_id::text, fp.external_key, 'fin:' || fp.fin_participant_id::text) AS partner_id,
       COALESCE(rp.name, fp.name) AS partner_name,
       COALESCE(rp.partner_type, fp.participant_type) AS partner_type,
       c.contribution_date::text,
       c.amount_contributed::text,
       c.status,
       c.created_at::text
     FROM fin_contribution c
     JOIN fin_participant fp ON fp.fin_participant_id = c.fin_participant_id
     LEFT JOIN re_partner rp
       ON rp.business_id = fp.business_id
      AND fp.external_key = rp.partner_id::text
     WHERE c.fin_capital_call_id = $1::uuid
     ORDER BY COALESCE(rp.name, fp.name)`,
    [callId]
  );

  const totalContributed = contributionsRes.rows.reduce((sum, row) => sum + toNumber(row.amount_contributed), 0);
  return {
    call,
    contributions: contributionsRes.rows,
    totals: {
      total_contributed: toMoneyString(totalContributed),
      outstanding: toMoneyString(Math.max(toNumber(call.amount_requested) - totalContributed, 0)),
      contribution_count: contributionsRes.rows.length,
    },
  };
}

export async function getDistributionDetail(pool: Pool, eventId: string): Promise<DistributionDetailResponse> {
  const eventRes = await pool.query(
    `SELECT
       de.fin_distribution_event_id::text AS event_id,
       de.fin_fund_id::text AS fund_id,
       ff.name AS fund_name,
       de.event_type,
       de.net_distributable::text AS total_amount,
       de.event_date::text AS effective_date,
       de.status,
       de.created_at::text
     FROM fin_distribution_event de
     JOIN fin_fund ff ON ff.fin_fund_id = de.fin_fund_id
     WHERE de.fin_distribution_event_id = $1::uuid
     LIMIT 1`,
    [eventId]
  );
  const event = eventRes.rows[0];
  if (!event) {
    return {
      event: null,
      payouts: [],
      totals: {
        total_payouts: "0.00",
        payout_count: 0,
        by_type: {},
      },
    };
  }

  const payoutRes = await pool.query(
    `SELECT
       dp.fin_distribution_payout_id::text AS payout_id,
       dp.fin_distribution_event_id::text AS event_id,
       COALESCE(rp.partner_id::text, fp.external_key, 'fin:' || fp.fin_participant_id::text) AS partner_id,
       COALESCE(rp.name, fp.name) AS partner_name,
       COALESCE(rp.partner_type, fp.participant_type) AS partner_type,
       dp.payout_type,
       dp.amount::text,
       de.status,
       dp.created_at::text
     FROM fin_distribution_payout dp
     JOIN fin_distribution_event de ON de.fin_distribution_event_id = dp.fin_distribution_event_id
     JOIN fin_participant fp ON fp.fin_participant_id = dp.fin_participant_id
     LEFT JOIN re_partner rp
       ON rp.business_id = fp.business_id
      AND fp.external_key = rp.partner_id::text
     WHERE dp.fin_distribution_event_id = $1::uuid
     ORDER BY COALESCE(rp.name, fp.name), dp.payout_type`,
    [eventId]
  );

  const byType: Record<string, number> = {};
  let totalPayouts = 0;
  for (const row of payoutRes.rows) {
    const amount = toNumber(row.amount);
    totalPayouts += amount;
    byType[row.payout_type as string] = (byType[row.payout_type as string] || 0) + amount;
  }

  return {
    event,
    payouts: payoutRes.rows,
    totals: {
      total_payouts: toMoneyString(totalPayouts),
      payout_count: payoutRes.rows.length,
      by_type: Object.fromEntries(Object.entries(byType).map(([key, value]) => [key, toMoneyString(value)])),
    },
  };
}
