"use client";

import { Suspense } from "react";
import BosSustainabilityWorkspace from "@/components/sustainability/BosSustainabilityWorkspace";

export default function BosSustainabilityPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-bm-muted2">Loading...</div>}>
      <BosSustainabilityWorkspace />
    </Suspense>
  );
}
