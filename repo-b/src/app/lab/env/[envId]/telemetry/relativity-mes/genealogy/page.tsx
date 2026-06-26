import { Suspense } from "react";
import BuildGenealogyConsole from "@/components/telemetry/relativity-mes/BuildGenealogyConsole";

export default function RelativityMesGenealogyPage() {
  return (
    <Suspense>
      <BuildGenealogyConsole />
    </Suspense>
  );
}
