"use client";

import { C, Panel, Tag, PageHeading } from "./primitives";

// Static skeleton of the operating-loop playbooks. Each stage points at the
// plan folder that documents it; the full playbook set is deferred work, and
// this panel says so rather than pretending otherwise.

const STAGES: { name: string; summary: string; doc: string }[] = [
  {
    name: "Request",
    summary: "A data request arrives in plain language: a metric, a pipeline, a dataset question.",
    doc: "docs/plans/automated-data-engineering/product-brief.md",
  },
  {
    name: "Intake",
    summary: "The request is classified and tied to a tracked work item before any code moves.",
    doc: "docs/plans/automated-data-engineering/backlog.md",
  },
  {
    name: "Plan",
    summary: "Scope, owning surfaces, and acceptance criteria are written down first.",
    doc: "docs/plans/automated-data-engineering/architecture.md",
  },
  {
    name: "Governed skill",
    summary: "Execution goes through a registered skill with declared permission and side-effect class.",
    doc: "docs/plans/automated-data-engineering/architecture.md",
  },
  {
    name: "Action",
    summary: "The skill runs against a connector whose status is declared in the inventory.",
    doc: "docs/plans/automated-data-engineering/connector-inventory.md",
  },
  {
    name: "Tests",
    summary: "Changes carry tests; failures stop the loop rather than shipping around it.",
    doc: "docs/plans/automated-data-engineering/eval-plan.md",
  },
  {
    name: "PR",
    summary: "Work lands as a reviewed pull request, never as an untracked mutation.",
    doc: "docs/plans/automated-data-engineering/security-and-trust-boundaries.md",
  },
  {
    name: "Receipt",
    summary: "Every execution writes an audit receipt: tool, mode, actor, timestamp.",
    doc: "docs/plans/automated-data-engineering/security-and-trust-boundaries.md",
  },
];

export default function PlaybooksPanel() {
  return (
    <>
      <PageHeading eyebrow="Method" title="Playbooks"
        blurb="The operating loop, stage by stage. Each stage references the plan document that defines it. This is the skeleton — the full playbook set is on the roadmap." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STAGES.map((s, i) => (
          <Panel key={s.name} pad={16}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 600, color: C.text }}>{s.name}</span>
              <Tag color={C.accent}>stage {i + 1}</Tag>
            </div>
            <p style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, lineHeight: 1.55, marginTop: 8 }}>
              {s.summary}
            </p>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 12,
              paddingTop: 10, borderTop: `1px solid ${C.border}`, wordBreak: "break-all" }}>
              ref: {s.doc}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
