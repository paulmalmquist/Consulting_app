import Link from 'next/link';
import { BeforeAfterDiagram } from '@/components/marketing/visual/BeforeAfterDiagram';
import { ControlLayerDiagram } from '@/components/marketing/visual/ControlLayerDiagram';
import { SloganBadge } from '@/components/marketing/visual/SloganBadge';

const timeline = [
  { phase: 'Phase 1', name: 'Discovery', gate: 'Approve pilot scope or stop', detail: 'Inventory systems, define workflow states, and baseline cost-of-breakage. Find where the data, the playbook, and the process are blocking AI today.' },
  { phase: 'Phase 2', name: 'Pilot', gate: 'Approve cutover readiness or stop', detail: 'Run current and new workflows in parallel with error and timing checks. The data layer goes in, the playbook gets written down, the AI hooks into clean inputs.' },
  { phase: 'Phase 3', name: 'Cutover', gate: 'Approve ownership transfer', detail: 'Cut over with rollback plan, runbook, and governance cadence. Hand the team a workflow that runs the same way twice — and an AI tool that works on it.' }
];

export default function WhatWeDoPage() {
  return (
    <div className="space-y-8 lg:space-y-10">
      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-6 sm:p-8 lg:p-10">
        <SloganBadge />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-nv-text sm:text-5xl">
          Get one workflow AI-ready, end to end, before your next AI vendor evaluation.
        </h1>
        <p className="mt-4 max-w-3xl text-sm text-nv-muted sm:text-base">
          We rebuild the data layer, write down the playbook, and put the process in a system that runs the same way twice. Then the AI you adopt — copilot, agent, model, vendor — actually works on real data the first time.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/operational-assessment" className="rounded-[4px] border border-nv-teal/25 bg-nv-bg/70 px-5 py-2.5 text-sm font-semibold text-nv-teal">See your first use case</Link>
          <Link href="/contact" className="rounded-full border border-nv-text/12 px-5 py-2.5 text-sm font-semibold text-nv-text">Fix your workflow</Link>
        </div>
      </section>

      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
        <p className="text-xs uppercase tracking-[0.14em] text-nv-teal">Timeline + Decision Gates</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {timeline.map((item) => (
            <article key={item.name} className="rounded-2xl border border-nv-text/10 bg-nv-bg/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-nv-dim">{item.phase}</p>
              <h2 className="mt-1 text-lg font-semibold text-nv-text">{item.name}</h2>
              <p className="mt-2 text-sm text-nv-muted">{item.detail}</p>
              <p className="mt-3 rounded-lg border border-nv-teal/25 bg-nv-teal/10 px-3 py-2 text-xs font-semibold text-nv-teal">Gate: {item.gate}</p>
            </article>
          ))}
        </div>
      </section>

      <BeforeAfterDiagram />
      <ControlLayerDiagram />

      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
        <h2 className="text-2xl font-semibold text-nv-text">What this looks like in practice</h2>
        <p className="mt-3 text-sm text-nv-muted">
          A consumer credit operator started with one exception queue. We mapped where the queue actually lived (three inboxes and a chat thread), captured the override logic that had only ever been spoken out loud, and put the whole thing in a workflow with one owner per item. Queue bounce-backs dropped 32%. The credit assistant the lender had been piloting for six months started giving answers analysts trusted — because it could finally see the queue and the policy at the same time.
        </p>
      </section>

      <section className="rounded-3xl border border-nv-teal/25 bg-nv-bg/80 p-6">
        <SloganBadge className="mb-4" />
        <h2 className="text-2xl font-semibold text-nv-text">What changes after the cutover</h2>
        <ul className="mt-3 space-y-2 text-sm text-nv-text">
          <li>A data layer your reporting, your AI tools, and your auditors all agree on.</li>
          <li>A playbook that exists outside someone's head, in a form an agent or a new hire can follow.</li>
          <li>A workflow that runs the same way on a Tuesday in March as it did in December.</li>
          <li>An AI tool that does the work the demo promised — because the inputs are finally real.</li>
        </ul>
        <Link href="/contact" className="mt-5 inline-flex rounded-[4px] border border-nv-teal/25 bg-nv-teal/10 px-5 py-2.5 text-sm font-semibold text-nv-teal">See where AI is blocked in your workflow</Link>
      </section>
    </div>
  );
}
