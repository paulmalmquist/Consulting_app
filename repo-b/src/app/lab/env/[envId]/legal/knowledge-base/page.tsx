"use client";
import React from "react";

import CapabilityUnavailable from "@/components/common/CapabilityUnavailable";

export default function LegalKnowledgeBasePage() {
  return (
    <section className="space-y-5" data-testid="legal-knowledge-base">
      <div>
        <h2 className="text-2xl font-semibold">Knowledge Base</h2>
        <p className="text-sm text-bm-muted2">Standard clauses, playbooks, policy templates, and legal precedents.</p>
      </div>
      <CapabilityUnavailable
        capabilityKey="legal.knowledge_base"
        title="Legal Knowledge Base"
        moduleLabel="Legal Ops Command"
        note="A searchable library of standard contract clauses, negotiation playbooks, approved policy templates, and legal precedent. This capability is scaffolded but not yet enabled in the current environment."
      />
    </section>
  );
}
