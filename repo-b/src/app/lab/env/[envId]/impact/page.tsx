"use client";

import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

export default function CommandCenterPage() {
  const { envId, businessId, environment } = useDomainEnv();

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5">
        <h2 className="text-lg font-semibold">Economic Impact Estimator</h2>
        <p className="mt-1 text-sm text-bm-muted2">
          Command center for this environment. Full functionality coming soon.
        </p>
        <p className="mt-2 text-xs text-bm-muted2">
          Environment: {envId} {businessId ? `· Business: ${businessId.slice(0, 8)}` : ""}
        </p>
      </section>
    </div>
  );
}
