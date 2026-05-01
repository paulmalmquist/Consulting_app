import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { PageHeader } from '@/components/marketing/ui/PageHeader';
import { SectionHeader } from '@/components/marketing/ui/SectionHeader';
import { ControlLayerDiagram } from '@/components/marketing/visual/ControlLayerDiagram';

const timeline = [
  {
    phase: 'Phase 1',
    name: 'Discovery',
    gate: 'Approve pilot scope or stop',
    detail: 'Inventory systems, define workflow states, and baseline cost-of-breakage. Find where the data, the playbook, and the process are blocking AI today.'
  },
  {
    phase: 'Phase 2',
    name: 'Pilot',
    gate: 'Approve cutover readiness or stop',
    detail: 'Run current and new workflows in parallel with error and timing checks. The data layer goes in, the playbook gets written down, the AI hooks into clean inputs.'
  },
  {
    phase: 'Phase 3',
    name: 'Cutover',
    gate: 'Approve ownership transfer',
    detail: 'Cut over with rollback plan, runbook, and governance cadence. Hand the team a workflow that runs the same way twice — and an AI tool that works on it.'
  }
];

const valueCase = [
  {
    title: 'Hours saved',
    body: 'Identify recurring manual work, duplicate entry, reporting cycles, approval delays, and handoffs that can be reduced or automated.'
  },
  {
    title: 'Risk avoided',
    body: 'Find where unsupported AI use, weak approvals, bad data, or unclear ownership can create compliance, reporting, or operating risk.'
  },
  {
    title: 'Technical debt exposed',
    body: 'Show which legacy tools, spreadsheets, and disconnected systems are slowing progress and what needs to be cleaned up first.'
  },
  {
    title: 'Investment path',
    body: 'Map quick wins, required fixes, expected effort, and the order of work so the rollout stays controlled.'
  }
];

export default function WhatWeDoPage() {
  return (
    <div className="nv-page">
      <PageHeader
        eyebrow="How we engage"
        headline="We prepare your business to use AI responsibly."
        lede="We review how work moves through your business, where data and approvals break down, and where AI is already creating risk or value. Then we build a practical path from assessment to controlled rollout."
      >
        <div className="flex flex-wrap gap-3" style={{ marginTop: 24 }}>
          <NvButton variant="primary" href="/operational-assessment">See your first use case</NvButton>
          <NvButton variant="secondary" href="/contact">Fix your workflow</NvButton>
        </div>
      </PageHeader>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Timeline + decision gates</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {timeline.map((item) => (
            <NvCard key={item.name}>
              <p className="nv-eyebrow" style={{ marginBottom: 8 }}>{item.phase}</p>
              <h2 className="nv-h3">{item.name}</h2>
              <p className="nv-body">{item.detail}</p>
              <p className="nv-pill nv-pill-teal" style={{ marginTop: 12 }}>Gate: {item.gate}</p>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <SectionHeader
          eyebrow="Value case"
          headline="Build the value case before the rollout."
          description="We quantify the work AI can reduce, the risks better controls can avoid, and the technical debt that needs to be addressed first. You get a practical view of expected value, required effort, and rollout priority."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {valueCase.map((item) => (
            <NvCard key={item.title}>
              <h3 className="nv-h3">{item.title}</h3>
              <p className="nv-body" style={{ margin: 0 }}>{item.body}</p>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <ControlLayerDiagram />
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />In practice</p>
        </div>
        <NvCard>
          <p className="nv-body">
            A consumer credit operator started with one exception queue. We mapped where the queue actually lived (three inboxes and a chat thread), captured the override logic that had only ever been spoken out loud, and put the whole thing in a workflow with one owner per item. Queue bounce-backs dropped 32%. The credit assistant the lender had been piloting for six months started giving answers analysts trusted — because it could finally see the queue and the policy at the same time.
          </p>
        </NvCard>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />What changes after cutover</p>
        </div>
        <NvCard>
          <ul className="nv-body" style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
            <li>A data layer your reporting, your AI tools, and your auditors all agree on.</li>
            <li>A playbook that exists outside someone&apos;s head, in a form an agent or a new hire can follow.</li>
            <li>A workflow that runs the same way on a Tuesday in March as it did in December.</li>
            <li>An AI tool that does the work the demo promised — because the inputs are finally real.</li>
          </ul>
          <div style={{ marginTop: 24 }}>
            <NvButton variant="primary" href="/contact">See where AI is blocked in your workflow</NvButton>
          </div>
        </NvCard>
      </section>
    </div>
  );
}
