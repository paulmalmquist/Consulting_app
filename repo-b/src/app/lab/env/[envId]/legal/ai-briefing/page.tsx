"use client";
import React from "react";

export default function LegalAiBriefingPage() {
  return (
    <section className="space-y-5" data-testid="legal-ai-briefing">
      <div>
        <h2 className="text-2xl font-semibold">AI Legal Briefing</h2>
        <p className="text-sm text-bm-muted2">Automated daily briefing on matter status, risk alerts, and deadline summaries.</p>
      </div>

      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Daily Legal Brief</p>
          <p className="text-xs text-bm-muted2">
            The AI Legal Briefing generates a concise executive summary of all active legal matters,
            upcoming deadlines, high-risk items, and outside counsel spend — delivered daily or on demand.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { title: "Contract Review Copilot", desc: "Highlights unusual liability caps, indemnities, and non-standard clauses." },
            { title: "Litigation Strategy Copilot", desc: "Summarizes case filings, arguments, and relevant precedent." },
            { title: "Compliance Copilot", desc: "Flags regulatory deadlines, missing filings, and policy violations." },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-bm-border/50 p-4 space-y-1">
              <p className="text-xs font-semibold">{item.title}</p>
              <p className="text-xs text-bm-muted2">{item.desc}</p>
            </div>
          ))}
        </div>

        <button
          disabled
          className="w-full sm:w-auto rounded-lg border border-bm-border/50 px-4 py-2 text-sm text-bm-muted2 cursor-not-allowed"
        >
          Generate Briefing — Coming Soon
        </button>
      </div>
    </section>
  );
}
