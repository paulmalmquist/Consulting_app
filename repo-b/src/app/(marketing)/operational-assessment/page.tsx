import Link from 'next/link';
import { OperationalQuestionnaire } from '@/components/marketing/assessment/OperationalQuestionnaire';
import { SloganBadge } from '@/components/marketing/visual/SloganBadge';

const steps = [
  { title: 'Inventory', detail: 'Map tools, owners, and handoffs for one workflow.' },
  { title: 'Measure', detail: 'Baseline delays, rework rates, and exception volume.' },
  { title: 'Redesign', detail: 'Define states, rules, and evidence requirements.' },
  { title: 'Certify', detail: 'Validate outputs, governance, and rollback readiness.' }
];

export default function OperationalAssessmentPage() {
  return (
    <div className="space-y-8 lg:space-y-10">
      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-6 sm:p-8 lg:p-10">
        <SloganBadge />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">Identify your highest-friction workflow in 4 steps.</h1>
        <p className="mt-4 max-w-3xl text-sm text-nv-muted sm:text-base">Own Your Operating Logic by scoring breakdown points before you invest in full rebuilds.</p>
      </section>

      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
        <div className="grid gap-3 md:grid-cols-4">
          {steps.map((step, index) => (
            <article key={step.title} className="rounded-2xl border border-nv-text/10 bg-nv-bg/40 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-nv-dim">Step {index + 1}</p>
              <h2 className="mt-1 text-base font-semibold text-white">{step.title}</h2>
              <p className="mt-2 text-sm text-nv-muted">{step.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
        <p className="text-xs uppercase tracking-[0.14em] text-nv-teal">Sample output preview</p>
        <div className="mt-3 rounded-2xl border border-nv-text/10 bg-nv-bg/40 p-4 text-sm text-nv-text">
          Workflow: Capital call approvals | Friction score: 78/100 (High) | Primary break: owner handoff between fund accounting and investor relations | First fix: state-based approval queue with rule-linked evidence.
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-white">Assessment quiz (returns a score)</h2>
        <OperationalQuestionnaire variant="public" />
      </section>

      <section className="rounded-3xl border border-nv-teal/25 bg-nv-bg/80 p-6">
        <h2 className="text-2xl font-semibold text-white">Typical Results</h2>
        <ul className="mt-3 space-y-2 text-sm text-nv-text">
          <li>Top workflow prioritized in under 1 week</li>
          <li>25–40% reduction in manual interventions after redesign</li>
          <li>90%+ traceability once control points are certified</li>
        </ul>
        <div className="mt-5 flex gap-3">
          <Link href="/contact" className="rounded-[4px] border border-nv-teal/25 bg-nv-teal/10 px-5 py-2.5 text-sm font-semibold text-nv-teal">See your first use case</Link>
          <span className="rounded-full border border-nv-text/12 px-3 py-2 text-xs text-nv-muted">Own Your Operating Logic</span>
        </div>
      </section>
    </div>
  );
}
