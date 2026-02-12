import ScenarioBuilder from "@/components/finance/ScenarioBuilder";

export default function FinanceScenarioPage({
  params,
}: {
  params: { dealId: string; scenarioId: string };
}) {
  return <ScenarioBuilder dealId={params.dealId} scenarioId={params.scenarioId} />;
}
