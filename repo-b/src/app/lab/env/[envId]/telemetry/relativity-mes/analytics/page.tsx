import { Suspense } from "react";
import BuildAnalyticsConsole from "@/components/telemetry/relativity-mes/BuildAnalyticsConsole";

export default function RelativityMesAnalyticsPage() {
  return (
    <Suspense>
      <BuildAnalyticsConsole />
    </Suspense>
  );
}
