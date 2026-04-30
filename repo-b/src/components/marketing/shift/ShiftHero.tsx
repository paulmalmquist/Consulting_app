import Link from 'next/link';
import { ArrowDownCircle } from 'lucide-react';

export function ShiftHero() {
  return (
    <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-6 sm:p-8 lg:p-10">
      <p className="text-sm uppercase tracking-[0.2em] text-nv-teal">The Shift</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-nv-text sm:text-4xl md:text-5xl">The Shift</h1>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-nv-muted sm:text-base">
        Operations are moving from scattered SaaS workflows to a unified execution engine with governed automation.
      </p>
      <div className="mt-6">
        <Link
          href="#shift-map"
          className="inline-flex items-center gap-2 rounded-[4px] border border-nv-teal/25 bg-nv-surface/70 px-5 py-2 text-sm font-semibold text-nv-teal transition hover:border-nv-teal/18 hover:bg-nv-teal/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-teal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg"
        >
          See the Shift Map
          <ArrowDownCircle size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
