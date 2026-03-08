"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { DealRadarWorkspace } from "@/components/repe/pipeline/DealRadarWorkspace";

export default function PipelinePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-bm-muted" />
        </div>
      }
    >
      <DealRadarWorkspace />
    </Suspense>
  );
}
