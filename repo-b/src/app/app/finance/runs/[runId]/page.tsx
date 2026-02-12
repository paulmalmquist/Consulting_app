import RunResultsViewer from "@/components/finance/RunResultsViewer";

export default function FinanceRunPage({
  params,
}: {
  params: { runId: string };
}) {
  return <RunResultsViewer runId={params.runId} />;
}
