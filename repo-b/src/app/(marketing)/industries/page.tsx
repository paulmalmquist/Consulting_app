import Link from 'next/link';
import { INDUSTRY_VERTICALS } from '@content/industry-verticals';
import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { PageHeader } from '@/components/marketing/ui/PageHeader';

export default function IndustriesPage() {
  return (
    <div className="nv-page">
      <PageHeader
        eyebrow="Industries"
        headline="The AI-readiness problem looks different in every vertical."
        lede="In REPE, the fund data lives in a spreadsheet only one person can open. In consumer credit, the policy lives in a PDF and the overrides live in chat. In medical, the queue lives in seven payer portals. In legal, the matter taxonomy means three different things to three different practice groups. The fix is the same: get the data, the playbook, and the process ready before the AI goes on top."
      />

      <section className="nv-section">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {INDUSTRY_VERTICALS.map((industry) => (
            <Link key={industry.slug} href={`/industries/${industry.slug}`} className="block">
              <NvCard liftOnHover>
                <p className="nv-h3">{industry.label}</p>
                <p className="nv-body">{industry.teaser}</p>
                <p className="nv-eyebrow" style={{ marginTop: 16, color: 'rgb(var(--nv-accent-teal))' }}>See the AI-readiness gap →</p>
              </NvCard>
            </Link>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />What changes in every vertical</p>
        </div>
        <NvCard>
          <ul className="nv-body" style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
            <li>The data your AI tools need lands in one place, with one set of rules.</li>
            <li>The playbook nobody had written down gets written down — in a form a model can read.</li>
            <li>The workflow runs the same way twice, so the AI on top of it has a real chance of helping.</li>
          </ul>
          <div style={{ marginTop: 24 }}>
            <NvButton variant="primary" href="/operational-assessment">Get an AI-readiness review</NvButton>
          </div>
        </NvCard>
      </section>
    </div>
  );
}
