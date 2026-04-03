"use client";

import { useEnv } from "@/components/EnvProvider";
import SqlAgentPanel from "@/components/sql-agent/SqlAgentPanel";

export default function SqlAgentPage() {
  const { selectedEnv, loading } = useEnv();

  if (loading) {
    return (
      <div className="p-6 text-xs text-[var(--bm-muted)] uppercase tracking-wider">
        Loading environment...
      </div>
    );
  }

  if (!selectedEnv) {
    return (
      <div className="p-6">
        <p className="text-xs text-[var(--bm-muted)]">
          Select an environment to use the SQL agent.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 shrink-0">
        <h1 className="text-sm font-medium text-[var(--bm-text)] uppercase tracking-wider">
          Data Query
        </h1>
        <p className="text-[10px] text-[var(--bm-muted)] mt-0.5">
          {selectedEnv.client_name} &middot; {selectedEnv.industry}
        </p>
      </div>

      {/* Agent panel */}
      <div className="flex-1 min-h-0">
        <SqlAgentPanel
          businessId={selectedEnv.business_id ?? ""}
          envId={selectedEnv.env_id}
          quarter={getCurrentQuarter()}
        />
      </div>
    </div>
  );
}

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}Q${q}`;
}
