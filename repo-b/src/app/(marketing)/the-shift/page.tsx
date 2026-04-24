import Link from 'next/link';
import { SloganBadge } from '@/components/marketing/visual/SloganBadge';

export default function TheShiftPage() {
  return (
    <div className="space-y-8 lg:space-y-10">
      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-6 sm:p-8 lg:p-10">
        <SloganBadge />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">The Shift: from software dependence to execution ownership.</h1>
        <p className="mt-4 max-w-3xl text-sm text-nv-muted sm:text-base">
          The next operating model is not “more tools.” It is owning the states, rules, and outputs that run your business. Own Your Operating Logic.
        </p>
      </section>

      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
        <h2 className="text-2xl font-semibold text-white">Manifesto</h2>
        <ul className="mt-4 space-y-2 text-sm text-nv-text">
          <li className="rounded-xl border border-nv-text/10 bg-nv-bg/40 p-3">Your core workflows should be governed by your team, not hidden in vendor logic.</li>
          <li className="rounded-xl border border-nv-text/10 bg-nv-bg/40 p-3">Automation without state control creates speed without accountability.</li>
          <li className="rounded-xl border border-nv-text/10 bg-nv-bg/40 p-3">Execution ownership means every output can be traced to a rule, a state, and an approver.</li>
        </ul>
      </section>

      <section className="rounded-3xl border border-nv-teal/25 bg-nv-bg/80 p-6">
        <h2 className="text-2xl font-semibold text-white">Action</h2>
        <p className="mt-2 text-sm text-nv-muted">Start with one workflow and prove the model in 12 weeks.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/operational-assessment" className="rounded-[4px] border border-nv-teal/25 bg-nv-teal/10 px-5 py-2.5 text-sm font-semibold text-nv-teal">See your first use case</Link>
          <Link href="/contact" className="rounded-full border border-nv-text/12 px-5 py-2.5 text-sm font-semibold text-white">Fix your workflow</Link>
        </div>
      </section>
    </div>
  );
}
