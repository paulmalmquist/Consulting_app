import Link from 'next/link';
import { INDUSTRY_VERTICALS } from '@content/industry-verticals';
import { SloganBadge } from '@/components/marketing/visual/SloganBadge';

export default function IndustriesPage() {
  return (
    <div className="space-y-8 lg:space-y-10">
      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-6 sm:p-8 lg:p-10">
        <SloganBadge />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">Industry playbooks built on one operating thesis.</h1>
        <p className="mt-4 max-w-3xl text-sm text-nv-muted sm:text-base">Own Your Operating Logic across REPE, credit, medical, and legal workflows using the same controlled execution model.</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {INDUSTRY_VERTICALS.map((industry) => (
          <Link key={industry.slug} href={`/industries/${industry.slug}`} className="rounded-2xl border border-nv-text/8 bg-nv-bg/80 p-5 hover:border-nv-teal/25">
            <p className="text-lg font-semibold text-white">{industry.label}</p>
            <p className="mt-2 text-sm text-nv-muted">{industry.teaser}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.14em] text-nv-teal">Own Your Operating Logic</p>
          </Link>
        ))}
      </section>

      <section className="rounded-3xl border border-nv-teal/25 bg-nv-bg/80 p-6">
        <h2 className="text-2xl font-semibold text-white">Typical Results</h2>
        <ul className="mt-3 space-y-2 text-sm text-nv-text">
          <li>25–40% reduction in manual reconciliation</li>
          <li>20–35% faster workflow cycle time</li>
          <li>90%+ traceability in control-critical workflows</li>
        </ul>
        <Link href="/operational-assessment" className="mt-5 inline-flex rounded-[4px] border border-nv-teal/25 bg-nv-teal/10 px-5 py-2.5 text-sm font-semibold text-nv-teal">Start with one workflow</Link>
      </section>
    </div>
  );
}
