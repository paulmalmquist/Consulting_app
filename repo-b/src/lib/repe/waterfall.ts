export type WaterfallTier = {
  tierOrder: number;
  tierType: "return_of_capital" | "preferred_return" | "catch_up" | "split";
  hurdleRate?: number | null;
  splitGp?: number | null;
  splitLp?: number | null;
  catchUpPercent?: number | null;
};

export type WaterfallPartner = {
  partnerId: string;
  name: string;
  partnerType: "gp" | "lp" | string;
  committedAmount: number;
  contributedCapital?: number;
};

export type WaterfallInput = {
  totalDistributable: number;
  partners: WaterfallPartner[];
  tiers: WaterfallTier[];
  accrualYears?: number;
};

export type TierAllocation = {
  partnerId: string;
  partnerName: string;
  amount: number;
};

export type TierResult = {
  tierCode: string;
  tierType: WaterfallTier["tierType"];
  amount: number;
  remainingAfter: number;
  allocations: TierAllocation[];
};

export type PartnerResult = {
  partnerId: string;
  partnerName: string;
  partnerType: string;
  totalDistribution: number;
  tierBreakdown: Record<string, number>;
};

export type WaterfallResult = {
  totalDistributable: number;
  totalAllocated: number;
  remaining: number;
  tierResults: TierResult[];
  partnerResults: PartnerResult[];
};

function roundAmount(value: number): number {
  return Number(value.toFixed(2));
}

function proportionalSplit(
  amount: number,
  partners: WaterfallPartner[],
  basisSelector: (partner: WaterfallPartner) => number
): TierAllocation[] {
  const basisTotal = partners.reduce((sum, partner) => sum + basisSelector(partner), 0);
  if (amount <= 0 || basisTotal <= 0) {
    return [];
  }

  return partners.map((partner, index) => {
    const basis = basisSelector(partner);
    const isLast = index === partners.length - 1;
    const allocated = isLast
      ? roundAmount(
          amount -
            partners
              .slice(0, index)
              .reduce(
                (sum, prior) =>
                  sum +
                  roundAmount(amount * (basisSelector(prior) / basisTotal)),
                0
              )
        )
      : roundAmount(amount * (basis / basisTotal));
    return {
      partnerId: partner.partnerId,
      partnerName: partner.name,
      amount: allocated,
    };
  });
}

export function runWaterfall(input: WaterfallInput): WaterfallResult {
  let remaining = roundAmount(input.totalDistributable);
  const tierResults: TierResult[] = [];
  const partnerIndex = new Map<string, PartnerResult>();

  const partners = input.partners.map((partner) => ({
    ...partner,
    contributedCapital: partner.contributedCapital ?? partner.committedAmount,
  }));
  const gpPartners = partners.filter((partner) => partner.partnerType === "gp");
  const lpPartners = partners.filter((partner) => partner.partnerType !== "gp");

  for (const partner of partners) {
    partnerIndex.set(partner.partnerId, {
      partnerId: partner.partnerId,
      partnerName: partner.name,
      partnerType: partner.partnerType,
      totalDistribution: 0,
      tierBreakdown: {},
    });
  }

  const applyTier = (tierType: WaterfallTier["tierType"], allocations: TierAllocation[]) => {
    const totalAmount = roundAmount(
      allocations.reduce((sum, allocation) => sum + allocation.amount, 0)
    );
    remaining = roundAmount(Math.max(0, remaining - totalAmount));
    const tierCode = `tier_${tierResults.length + 1}_${tierType}`;
    tierResults.push({
      tierCode,
      tierType,
      amount: totalAmount,
      remainingAfter: remaining,
      allocations,
    });

    for (const allocation of allocations) {
      const partner = partnerIndex.get(allocation.partnerId);
      if (!partner) continue;
      partner.totalDistribution = roundAmount(
        partner.totalDistribution + allocation.amount
      );
      partner.tierBreakdown[tierCode] = roundAmount(
        (partner.tierBreakdown[tierCode] || 0) + allocation.amount
      );
    }
  };

  for (const tier of [...input.tiers].sort((a, b) => a.tierOrder - b.tierOrder)) {
    if (remaining <= 0) {
      applyTier(tier.tierType, []);
      continue;
    }

    if (tier.tierType === "return_of_capital") {
      const outstanding = partners.reduce(
        (sum, partner) => sum + (partner.contributedCapital || 0),
        0
      );
      const amount = Math.min(remaining, outstanding);
      applyTier(
        tier.tierType,
        proportionalSplit(amount, partners, (partner) => partner.contributedCapital || 0)
      );
      continue;
    }

    if (tier.tierType === "preferred_return") {
      const hurdleRate = tier.hurdleRate ?? 0.08;
      const accrualYears = input.accrualYears ?? 1;
      const required = lpPartners.reduce(
        (sum, partner) =>
          sum + (partner.contributedCapital || 0) * hurdleRate * accrualYears,
        0
      );
      const amount = Math.min(remaining, required);
      applyTier(
        tier.tierType,
        proportionalSplit(amount, lpPartners, (partner) => partner.contributedCapital || 0)
      );
      continue;
    }

    if (tier.tierType === "catch_up") {
      const splitGp =
        input.tiers.find((candidate) => candidate.tierType === "split")?.splitGp ?? 0.2;
      const prefTier = tierResults.find(
        (candidate) => candidate.tierType === "preferred_return"
      );
      const lpPref = prefTier?.amount ?? 0;
      const targetCatchUp = lpPref > 0 ? (splitGp / (1 - splitGp)) * lpPref : 0;
      const amount = Math.min(
        remaining,
        targetCatchUp * (tier.catchUpPercent ?? 1)
      );
      applyTier(
        tier.tierType,
        proportionalSplit(amount, gpPartners, (partner) => partner.committedAmount || 1)
      );
      continue;
    }

    if (tier.tierType === "split") {
      const gpSplit = tier.splitGp ?? 0.2;
      const lpSplit = tier.splitLp ?? 0.8;
      const gpAmount = roundAmount(remaining * gpSplit);
      const lpAmount = roundAmount(remaining * lpSplit);
      const allocations = [
        ...proportionalSplit(gpAmount, gpPartners, (partner) => partner.committedAmount || 1),
        ...proportionalSplit(lpAmount, lpPartners, (partner) => partner.committedAmount || 1),
      ];
      applyTier(tier.tierType, allocations);
      continue;
    }
  }

  const totalAllocated = roundAmount(
    Array.from(partnerIndex.values()).reduce(
      (sum, partner) => sum + partner.totalDistribution,
      0
    )
  );

  return {
    totalDistributable: roundAmount(input.totalDistributable),
    totalAllocated,
    remaining: roundAmount(Math.max(0, input.totalDistributable - totalAllocated)),
    tierResults,
    partnerResults: Array.from(partnerIndex.values()),
  };
}
