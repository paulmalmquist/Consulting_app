"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/investigation/sessionStream";

// Small launch affordance (plan PR 7): creates an investigation session for the
// selected environment and navigates to the workspace. Fail-closed: disabled
// without a real env/tenant. No fabricated content — the backend grounds the session.
export function InvestigateButton({
  envId,
  businessId,
  title = "Environment investigation",
  sourceRef,
  className,
}: {
  envId: string | null;
  businessId?: string | null;
  title?: string;
  sourceRef?: Record<string, unknown>;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const disabled = !envId || busy;

  async function launch() {
    if (!envId) return;
    setBusy(true);
    try {
      const res = await createSession(envId, title, { source_ref: sourceRef }, businessId ?? undefined);
      if (res?.session_id) {
        router.push(`/app/investigate/${res.session_id}`);
        return;
      }
    } catch {
      /* swallow — leave the button re-enabled so the user can retry */
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={() => void launch()}
      disabled={disabled}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/75 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50"
      }
      title={envId ? "Start a grounded investigation for this environment" : "Select an environment first"}
    >
      <span aria-hidden>▶</span> Investigate
    </button>
  );
}

export default InvestigateButton;
