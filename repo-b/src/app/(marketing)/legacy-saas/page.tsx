import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { PageHeader } from '@/components/marketing/ui/PageHeader';

export default function LegacySaaSPage() {
  return (
    <div className="nv-page">
      <PageHeader
        eyebrow="Legacy SaaS"
        headline="Legacy SaaS migration."
        lede="SaaS sprawl creates duplicated logic, fragmented workflows, and expensive change requests. We replace it with one controlled execution layer."
      />

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Cost example</p>
        </div>
        <NvCard>
          <p className="nv-body" style={{ margin: 0 }}>Typical mid-market stack: 11 overlapping workflow tools, $420k annual license spend, plus 2,000+ manual reconciliation hours per year.</p>
        </NvCard>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Before / after architecture</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <NvCard>
            <p className="nv-eyebrow" style={{ marginBottom: 8, color: 'rgb(var(--nv-sem-risk))' }}>Before</p>
            <p className="nv-body" style={{ margin: 0 }}>Multiple SaaS tools, spreadsheet glue, hidden logic, no unified audit trail.</p>
          </NvCard>
          <NvCard>
            <p className="nv-eyebrow" style={{ marginBottom: 8, color: 'rgb(var(--nv-accent-teal))' }}>After</p>
            <p className="nv-body" style={{ margin: 0 }}>One controlled execution layer over existing systems with explicit states, rules, and outputs.</p>
          </NvCard>
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />What changes</p>
        </div>
        <NvCard>
          <ul className="nv-body" style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
            <li>15–30% SaaS license reduction potential</li>
            <li>20–40% less manual handoff reconciliation</li>
            <li>90%+ traceability for migrated workflows</li>
          </ul>
          <div style={{ marginTop: 24 }}>
            <NvButton variant="primary" href="/contact">Fix your migration workflow</NvButton>
          </div>
        </NvCard>
      </section>
    </div>
  );
}
