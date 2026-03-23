"use client";

import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import WinstonWorkspace from "@/components/copilot/WinstonWorkspace";

export default function CommandCenterPage() {
  const { envId, businessId, environment, loading, error, requestId, retry } = useDomainEnv();

  if (loading) {
    return (
      <div className="rounded-3xl border border-bm-border/60 bg-bm-surface/20 p-6 text-sm text-bm-muted">
        Loading Winston copilot workspace...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-6">
        <h2 className="text-lg font-semibold text-bm-text">Workspace unavailable</h2>
        <p className="mt-2 text-sm text-bm-muted">{error}</p>
        {requestId ? <p className="mt-2 text-xs text-bm-muted2">Request ID: {requestId}</p> : null}
        <button type="button" onClick={() => void retry()} className="mt-4 rounded-full border border-bm-border/50 px-4 py-2 text-sm text-bm-text">
          Retry
        </button>
      </div>
    );
  }

  return (
    <WinstonWorkspace
      envId={envId}
      businessId={businessId}
      environmentName={environment?.client_name || environment?.workspace_template_key || "Winston"}
    />
  );
}
