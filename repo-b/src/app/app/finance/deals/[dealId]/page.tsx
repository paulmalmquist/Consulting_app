import DealWaterfallDetail from "@/components/finance/DealWaterfallDetail";

export default function FinanceDealDetailPage({
  params,
}: {
  params: { dealId: string };
}) {
  return <DealWaterfallDetail dealId={params.dealId} />;
}
