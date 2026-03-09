import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsForecastPage() {
  return (
    <PdsWorkspacePage
      title="Forecast"
      description="Track revenue forecast movement, explain overrides, and see confidence bands before misses roll into the next month or quarter."
      defaultLens="market"
      defaultHorizon="Forecast"
      sections={["performance", "forecast", "briefing"]}
    />
  );
}
