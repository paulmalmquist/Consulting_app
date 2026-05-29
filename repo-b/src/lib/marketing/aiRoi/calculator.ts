export const WORK_HOURS_PER_YEAR = 2080;
export const VALUE_RANGE_LOW = 0.75;
export const VALUE_RANGE_HIGH = 1.25;
export const MAX_COMBINED_MULTIPLIER = 24;

export const ROLE_MULTIPLIERS = {
  individual: 1.0,
  analyst: 1.4,
  manager: 2.0,
  executive: 3.2,
  revenue_or_client: 4.0,
} as const;

export const AUDIENCE_MULTIPLIERS = {
  self: 1.0,
  team: 1.4,
  function: 2.2,
  executive_board: 3.4,
  customer_investor: 4.0,
} as const;

export const OUTPUT_MULTIPLIERS = {
  task: 1.0,
  recurring_report: 1.3,
  decision_packet: 1.8,
  customer_asset: 2.2,
} as const;

export type RoleType = keyof typeof ROLE_MULTIPLIERS;
export type ServedAudience = keyof typeof AUDIENCE_MULTIPLIERS;
export type OutputType = keyof typeof OUTPUT_MULTIPLIERS;

export type RoiReframeInputs = {
  annualCompensation: number;
  freedHoursPerWeek: number;
  roleType: RoleType;
  servedAudience: ServedAudience;
  outputType: OutputType;
};

export type RoiComparison = {
  roleType: RoleType;
  combinedMultiplier: number;
  annualIllustrativeValue: number;
  annualIllustrativeRangeLow: number;
  annualIllustrativeRangeHigh: number;
};

export type RoiReframeResult = {
  recoverableHoursPerYear: number | null;
  baseSalaryEquivalentAnnual: number | null;
  selectedCombinedMultiplier: number | null;
  annualIllustrativeValue: number | null;
  annualIllustrativeRangeLow: number | null;
  annualIllustrativeRangeHigh: number | null;
  monthlyIllustrativeRangeLow: number | null;
  monthlyIllustrativeRangeHigh: number | null;
  comparisons: RoiComparison[];
  insight: string | null;
  nullReason: string | null;
};

function roundDollars(value: number): number {
  return Math.round(value);
}

function roundMultiplier(value: number): number {
  return Math.round(value * 100) / 100;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getCombinedMultiplier(
  roleType: RoleType,
  servedAudience: ServedAudience,
  outputType: OutputType,
): number {
  const raw =
    ROLE_MULTIPLIERS[roleType] *
    AUDIENCE_MULTIPLIERS[servedAudience] *
    OUTPUT_MULTIPLIERS[outputType];
  return roundMultiplier(Math.min(raw, MAX_COMBINED_MULTIPLIER));
}

function invalid(reason: string): RoiReframeResult {
  return {
    recoverableHoursPerYear: null,
    baseSalaryEquivalentAnnual: null,
    selectedCombinedMultiplier: null,
    annualIllustrativeValue: null,
    annualIllustrativeRangeLow: null,
    annualIllustrativeRangeHigh: null,
    monthlyIllustrativeRangeLow: null,
    monthlyIllustrativeRangeHigh: null,
    comparisons: [],
    insight: null,
    nullReason: reason,
  };
}

export function computeRoiReframe(inputs: RoiReframeInputs): RoiReframeResult {
  if (!isFinitePositive(inputs.annualCompensation)) {
    return invalid("Annual compensation must be a positive number.");
  }
  if (!isFinitePositive(inputs.freedHoursPerWeek)) {
    return invalid("Freed hours per week must be a positive number.");
  }
  if (!(inputs.roleType in ROLE_MULTIPLIERS)) {
    return invalid("Role type is not recognized.");
  }
  if (!(inputs.servedAudience in AUDIENCE_MULTIPLIERS)) {
    return invalid("Served audience is not recognized.");
  }
  if (!(inputs.outputType in OUTPUT_MULTIPLIERS)) {
    return invalid("Output type is not recognized.");
  }

  const recoverableHoursPerYear = inputs.freedHoursPerWeek * 52;
  const hourlyCost = inputs.annualCompensation / WORK_HOURS_PER_YEAR;
  const baseSalaryEquivalentAnnual = roundDollars(hourlyCost * recoverableHoursPerYear);

  const comparisons = (Object.keys(ROLE_MULTIPLIERS) as RoleType[]).map((roleType) => {
    const combinedMultiplier = getCombinedMultiplier(
      roleType,
      inputs.servedAudience,
      inputs.outputType,
    );
    const annualIllustrativeValue = roundDollars(baseSalaryEquivalentAnnual * combinedMultiplier);
    return {
      roleType,
      combinedMultiplier,
      annualIllustrativeValue,
      annualIllustrativeRangeLow: roundDollars(annualIllustrativeValue * VALUE_RANGE_LOW),
      annualIllustrativeRangeHigh: roundDollars(annualIllustrativeValue * VALUE_RANGE_HIGH),
    };
  });

  const selected = comparisons.find((item) => item.roleType === inputs.roleType);
  if (!selected) {
    return invalid("Selected role comparison could not be computed.");
  }

  return {
    recoverableHoursPerYear,
    baseSalaryEquivalentAnnual,
    selectedCombinedMultiplier: selected.combinedMultiplier,
    annualIllustrativeValue: selected.annualIllustrativeValue,
    annualIllustrativeRangeLow: selected.annualIllustrativeRangeLow,
    annualIllustrativeRangeHigh: selected.annualIllustrativeRangeHigh,
    monthlyIllustrativeRangeLow: roundDollars(selected.annualIllustrativeRangeLow / 12),
    monthlyIllustrativeRangeHigh: roundDollars(selected.annualIllustrativeRangeHigh / 12),
    comparisons,
    insight:
      "The same freed hour changes value when the output is consumed by more people or used in higher-stakes decisions.",
    nullReason: null,
  };
}

