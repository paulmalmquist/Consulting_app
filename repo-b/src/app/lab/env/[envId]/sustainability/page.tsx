"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import BosSustainabilityWorkspace from "@/components/sustainability/BosSustainabilityWorkspace";

/**
 * Sustainability workspace, scoped to the environment in the route.
 *
 * The workspace reads governed metrics through the authoritative reader, which
 * scopes on (business_id, env_id). Those have to be the environment's real ids
 * or the reader correctly finds no released snapshot and the page fails closed
 * to `snapshot_unavailable`. So the env id comes from the route, and the
 * business id from the environment it belongs to.
 *
 * Rendered full-bleed with no shared workspace chrome, per ADR 0001 decision 3.
 */

// The business that owns the demo environments. The sustainability demo
// environment (`Sustainability Demo`) is bound to this business, and the
// released snapshot sus-demo-2026Q1-002 is scoped to the pair.
const DEMO_BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001";

export default function EnvSustainabilityPage() {
  const params = useParams<{ envId: string }>();
  const envId = typeof params?.envId === "string" ? params.envId : "";

  return (
    <Suspense fallback={<div className="p-6 text-sm text-bm-muted2">Loading...</div>}>
      <BosSustainabilityWorkspace
        query={{
          business_id: DEMO_BUSINESS_ID,
          env_id: envId,
          entity_scope: "portfolio",
          period_key: "2026Q1",
          metric_family: "sustainability",
        }}
      />
    </Suspense>
  );
}
