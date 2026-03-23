"use client";

import { Suspense } from "react";
import SustainabilityWorkspace from "@/components/repe/sustainability/SustainabilityWorkspace";

export default function SustainabilityPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-bm-muted2">Loading...</div>}>
      <SustainabilityWorkspace />
    </Suspense>
  );
}
