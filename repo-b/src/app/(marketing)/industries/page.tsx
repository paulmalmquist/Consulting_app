import Link from 'next/link';
import { INDUSTRY_VERTICALS } from '@content/industry-verticals';
import { SloganBadge } from '@/components/marketing/visual/SloganBadge';

export default function IndustriesPage() {
  return (
    <div className="space-y-8 lg:space-y-10">
      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-6 sm:p-8 lg:p-10">
        <SloganBadge />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-nv-text sm:text-5xl">The AI-readiness problem looks different in every industry.</h1>
        <p className="mt-4 max-w-3xl text-sm text-nv-muted sm:text-base">In REPE, the fund data lives in a spreadsheet only one person can open. In consumer credit, the policy lives in a PDF and the overrides live in chat. In medical, the queue lives in seven payer portals. In legal, the matter taxonomy means three different things to three different practice groups. The shape of the work below is the same — get the data, the playbook, and the process ready before the AI goes on top.</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {INDUSTRY_VERTICALS.map((industry) => (
          <Link key={industry.slug} href={`/industries/${industry.slug}`} className="rounded-2xl border border-nv-text/8 bg-nv-bg/80 p-5 hover:border-nv-teal/25">
            <p className="text-lg font-semibold text-nv-text">{industry.label}</p>
            <p className="mt-2 text-sm text-nv-muted">{industry.teaser}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.14em] text-nv-teal">See the AI-readiness gap →</p>
          </Link>
        ))}
      </section>

      <section className="rounded-3xl border border-nv-teal/25 bg-nv-bg/80 p-6">
        <h2 className="text-2xl font-semibold text-nv-text">What changes in every vertical</h2>
        <ul className="mt-3 space-y-2 text-sm text-nv-text">
          <li>The data your AI tools need lands in one place, with one set of rules.</li>
          <li>The playbook nobody had written down gets written down — in a form a model can read.</li>
          <li>The workflow runs the same way twice, so the AI on top of it has a real chance of helping.</li>
        </ul>
        <Link href="/operational-assessment" className="mt-5 inline-flex rounded-[4px] border border-nv-teal/25 bg-nv-teal/10 px-5 py-2.5 text-sm font-semibold text-nv-teal">Get an AI-readiness review</Link>
      </section>
    </div>
  );
}
