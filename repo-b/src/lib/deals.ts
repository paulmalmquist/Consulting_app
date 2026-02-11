/**
 * deals.ts
 * Deal pipeline data model and localStorage persistence.
 */

export type DealStage =
  | "origination"
  | "underwriting"
  | "ic_review"
  | "closed_won"
  | "closed_lost";

export const DEAL_STAGES: { key: DealStage; label: string }[] = [
  { key: "origination", label: "Origination" },
  { key: "underwriting", label: "Underwriting" },
  { key: "ic_review", label: "IC Review" },
  { key: "closed_won", label: "Closed Won" },
  { key: "closed_lost", label: "Closed Lost" },
];

export type Deal = {
  id: string;
  name: string;
  company: string;
  value: number;
  stage: DealStage;
  owner: string;
  probability: number;
  createdAt: string;
};

const STORAGE_KEY = "winston_deals";

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getDeals(): Deal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Deal[];
  } catch {
    return [];
  }
}

export function saveDeals(deals: Deal[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
}

export function addDeal(
  deal: Omit<Deal, "id" | "createdAt">
): Deal {
  const deals = getDeals();
  const newDeal: Deal = {
    ...deal,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  deals.push(newDeal);
  saveDeals(deals);
  return newDeal;
}

export function updateDealStage(id: string, stage: DealStage): Deal | null {
  const deals = getDeals();
  const idx = deals.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  deals[idx] = { ...deals[idx], stage };
  saveDeals(deals);
  return deals[idx];
}

export function getPipelineStats(deals: Deal[]) {
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
  const weightedValue = deals.reduce(
    (sum, d) => sum + d.value * (d.probability / 100),
    0
  );
  const countByStage: Record<DealStage, number> = {
    origination: 0,
    underwriting: 0,
    ic_review: 0,
    closed_won: 0,
    closed_lost: 0,
  };
  for (const d of deals) {
    countByStage[d.stage]++;
  }
  return { totalValue, weightedValue, count: deals.length, countByStage };
}
