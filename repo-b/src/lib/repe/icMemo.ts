type IcMemoInput = {
  fundName: string;
  quarter: string;
  quarterState: {
    portfolioNav?: number | null;
    grossIrr?: number | null;
    netIrr?: number | null;
    tvpi?: number | null;
    dpi?: number | null;
  } | null;
  scenario?: {
    name: string;
    grossIrr?: number | null;
    portfolioNav?: number | null;
    grossTvpi?: number | null;
  } | null;
  modelRun?: {
    runId: string;
    status: string;
    metrics: Array<{ metric: string; modelValue: number | null; variance: number | null }>;
  } | null;
  documentCount: number;
  loanCount: number;
  varianceHighlights: Array<{
    assetName: string;
    lineCode: string;
    varianceAmount: number | null;
  }>;
};

function formatMoney(value?: number | null): string {
  if (value === null || value === undefined) return "N/A";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${value.toFixed(0)}`;
}

function formatMultiple(value?: number | null): string {
  if (value === null || value === undefined) return "N/A";
  return `${value.toFixed(2)}x`;
}

function formatPct(value?: number | null): string {
  if (value === null || value === undefined) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

export function composeIcMemo(input: IcMemoInput): {
  title: string;
  markdown: string;
  narrativeText: string;
  contentJson: Record<string, unknown>;
} {
  const topVariance = input.varianceHighlights.slice(0, 3);
  const scenarioLine = input.scenario
    ? `Scenario focus: ${input.scenario.name} implies ${formatPct(
        input.scenario.grossIrr ?? null
      )} gross IRR and ${formatMoney(input.scenario.portfolioNav ?? null)} NAV.`
    : "Scenario focus: no dedicated scenario was selected, so the base quarter state anchors this memo.";

  const modelLine = input.modelRun
    ? `Latest underwriting run ${input.modelRun.runId} is ${input.modelRun.status}.`
    : "No persisted underwriting run is attached, so this memo relies on quarter-state and variance data.";

  const varianceLines =
    topVariance.length > 0
      ? topVariance
          .map(
            (item) =>
              `- ${item.assetName}: ${item.lineCode} variance ${formatMoney(
                item.varianceAmount ?? null
              )}`
          )
          .join("\n")
      : "- No material variance lines were available.";

  const title = `${input.fundName} ${input.quarter} IC Memo`;
  const markdown = `# ${title}

## Deal Summary
- Fund NAV: ${formatMoney(input.quarterState?.portfolioNav ?? null)}
- Gross IRR: ${formatPct(input.quarterState?.grossIrr ?? null)}
- Net IRR: ${formatPct(input.quarterState?.netIrr ?? null)}
- TVPI: ${formatMultiple(input.quarterState?.tvpi ?? null)}
- DPI: ${formatMultiple(input.quarterState?.dpi ?? null)}

## Underwriting And Scenario
${scenarioLine}
${modelLine}

## Diligence Coverage
- Documents in scope: ${input.documentCount}
- Loans linked to fund: ${input.loanCount}

## Variance Highlights
${varianceLines}

## Recommendation
Proceed to committee with attention on the highlighted variances, and confirm scenario outputs against the latest underwriting run before approval.
`;

  return {
    title,
    markdown,
    narrativeText: markdown.replace(/\n{2,}/g, "\n\n").trim(),
    contentJson: {
      title,
      fund_name: input.fundName,
      quarter: input.quarter,
      quarter_state: input.quarterState,
      scenario: input.scenario,
      model_run: input.modelRun,
      diligence: {
        document_count: input.documentCount,
        loan_count: input.loanCount,
      },
      variance_highlights: topVariance,
    },
  };
}
