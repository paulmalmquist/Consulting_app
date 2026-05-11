import TradingAnalyticsWorkbench from "@/components/trading-analytics/TradingAnalyticsWorkbench";

export default function TradingAnalyticsPage({ params }: { params: { envId: string } }) {
  return <TradingAnalyticsWorkbench envId={params.envId} />;
}
