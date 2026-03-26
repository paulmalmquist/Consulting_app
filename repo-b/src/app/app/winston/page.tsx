"use client";

import React, { Suspense } from "react";
import { WinstonCompanionWorkspace } from "@/components/winston-companion/WinstonCompanionSurface";

export default function WinstonPage() {
  return (
    <Suspense fallback={null}>
      <WinstonCompanionWorkspace />
    </Suspense>
  );
}
