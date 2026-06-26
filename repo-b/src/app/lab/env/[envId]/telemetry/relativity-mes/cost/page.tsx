import { Suspense } from "react";
import CostReconciliationConsole from "@/components/telemetry/relativity-mes/CostReconciliationConsole";

export default function RelativityMesCostPage() {
  return (
    <Suspense>
      <CostReconciliationConsole />
    </Suspense>
  );
}
