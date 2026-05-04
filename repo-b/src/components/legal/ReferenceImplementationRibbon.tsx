"use client";

import { useState } from "react";

export default function ReferenceImplementationRibbon() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-bm-border/60 bg-bm-surface/30 px-4 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-bm-accent/40 bg-bm-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-bm-accent">
          Reference implementation
        </span>
        <span className="text-bm-muted2">
          The patterns shown here — intake, playbook-grounded review, decision packets, attorney supervision, audit trail — are designed to be implemented inside your stack. Winston prepares the file. Counsel approves the judgment.
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-md border border-bm-border/70 px-2 py-0.5 text-[11px] hover:bg-bm-surface/40"
          aria-expanded={open}
        >
          {open ? "Hide" : "What's this?"}
        </button>
      </div>
      {open ? (
        <div className="mt-2 grid gap-2 rounded-lg border border-bm-border/60 bg-bm-surface/20 p-3 text-xs leading-relaxed text-bm-muted2 sm:grid-cols-2">
          <div>
            <div className="mb-1 font-semibold text-bm-text">Demo implementation</div>
            <p>Uses Winston tables and seeded data so the operating layer is legible end to end.</p>
          </div>
          <div>
            <div className="mb-1 font-semibold text-bm-text">Client implementation</div>
            <p>
              Replace the named adapters with your own systems — Jira / ServiceNow for intake, SharePoint / iManage for documents, Okta / Active Directory for approvers, Splunk for the audit sink, native CLM for contracts. Each module page surfaces its adapter chip.
            </p>
          </div>
          <div className="sm:col-span-2 text-[11px] text-bm-muted2/80">
            See <code className="rounded bg-bm-surface/60 px-1">docs/winston-legal/REFERENCE_FRAMEWORK.md</code> for the full eight-module map and adapter contracts.
          </div>
        </div>
      ) : null}
    </div>
  );
}
