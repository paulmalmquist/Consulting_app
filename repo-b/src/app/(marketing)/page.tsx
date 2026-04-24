import Link from 'next/link';
import { BeforeAfterDiagram } from '@/components/marketing/visual/BeforeAfterDiagram';
import { ControlLayerDiagram } from '@/components/marketing/visual/ControlLayerDiagram';
import { SloganBadge } from '@/components/marketing/visual/SloganBadge';

const steps = [
  { name: 'Discovery', detail: 'Map one high-friction workflow and baseline cycle time, error rate, and owner gaps.' },
  { name: 'Pilot', detail: 'Build controlled states, rules, and evidence in parallel with current operations.' },
  { name: 'Cutover', detail: 'Switch with rollback protection once outputs match and governance is approved.' }
];

export default function HomePage() {
  return (
    <div className="space-y-8 lg:space-y-10">
      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-6 sm:p-8 lg:p-10">
        <SloganBadge />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
          Put AI To Work
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-nv-muted sm:text-base">
          Own and Control AI Your Strategy With Our Help
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/operational-assessment" className="rounded-[4px] border border-nv-teal/25 bg-nv-bg/70 px-5 py-2.5 text-sm font-semibold text-nv-teal">
            Identify your first fixable workflow in 30 minutes
          </Link>
          <Link href="/what-we-do" className="rounded-full border border-nv-text/12 px-5 py-2.5 text-sm font-semibold text-white">
            Start with one workflow
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
        <p className="text-xs uppercase tracking-[0.14em] text-nv-teal">3-step model</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {steps.map((step, index) => (
            <article key={step.name} className="rounded-2xl border border-nv-text/10 bg-nv-bg/40 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-nv-dim">Step {index + 1}</p>
              <h2 className="mt-1 text-lg font-semibold text-white">{step.name}</h2>
              <p className="mt-2 text-sm text-nv-muted">{step.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <BeforeAfterDiagram title="Own Your Operating Logic: Workflow Transformation" />
      <ControlLayerDiagram title="Controlled Execution Layer" />

      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
        <p className="text-xs uppercase tracking-[0.14em] text-nv-teal">Case example (illustrative)</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">From reporting drift to controlled fund operations</h2>
        <p className="mt-2 text-sm text-nv-muted">
          A synthetic REPE scenario: a mid-market operator replaced spreadsheet-driven capital call handoffs with state-based approvals and reduced capital call errors from 5% to 1.2% in 8 weeks.
        </p>
      </section>

      <section className="rounded-3xl border border-nv-teal/25 bg-nv-bg/80 p-6">
        <SloganBadge className="mb-4" />
        <h2 className="text-2xl font-semibold text-white">Typical Results</h2>
        <ul className="mt-3 space-y-2 text-sm text-nv-text">
          <li>25–40% reduction in manual reconciliation</li>
          <li>30% faster reporting cycles</li>
          <li>90%+ traceability on key workflows</li>
        </ul>
        <p className="mt-4 text-sm text-nv-muted">Own Your Operating Logic is the operating thesis behind every implementation.</p>
      </section>
    </div>
  );
}
