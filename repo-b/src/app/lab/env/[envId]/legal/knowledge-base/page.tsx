"use client";
import React from "react";

export default function LegalKnowledgeBasePage() {
  return (
    <section className="space-y-5" data-testid="legal-knowledge-base">
      <div>
        <h2 className="text-2xl font-semibold">Knowledge Base</h2>
        <p className="text-sm text-bm-muted2">Standard clauses, playbooks, policy templates, and legal precedents.</p>
      </div>
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-8 text-center">
        <p className="text-sm font-medium">Legal Knowledge Base</p>
        <p className="mt-2 text-sm text-bm-muted2">
          A searchable library of standard contract clauses, negotiation playbooks,<br />
          approved policy templates, and legal precedent. Coming soon.
        </p>
      </div>
    </section>
  );
}
