import type { Metadata } from 'next';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { NvButton } from '@/components/marketing/ui/NvButton';

export const metadata: Metadata = {
  title: 'Comprehensive Data Strategy | Novendor',
  description:
    'We design and build the data systems your business actually runs on — from source systems to executive reporting, structured, governed, and tied to decisions.',
  alternates: { canonical: '/capabilities/comprehensive-data-strategy' },
};

const coverage = [
  {
    title: 'Data warehouse design',
    detail: 'Modern lakehouse and warehouse on Databricks, Snowflake, or Azure. Modeled around the questions leadership actually asks.',
  },
  {
    title: 'System integration',
    detail: 'Pull from the systems where the work lives — Yardi, MRI, Salesforce, internal tools — with explicit ownership and freshness contracts.',
  },
  {
    title: 'Semantic layer + reporting',
    detail: 'Governed metrics in Power BI so every number on a slide ties back to a definition the team agreed on.',
  },
  {
    title: 'Pipeline automation',
    detail: 'ETL/ELT in Python and SQL with state, retries, and observability. No more "the report is late because something failed overnight".',
  },
  {
    title: 'Data governance',
    detail: 'Validation, access control, and lineage as part of the build, not as a later cleanup project.',
  },
];

const outcomes = [
  'One source of truth across the systems that matter.',
  'Reporting cycles compressed from days to hours.',
  'Manual reporting effort cut significantly.',
  'Executives see real performance, not snapshots that drift.',
  'Consistent metrics across teams — finance, ops, investors all reading the same numbers.',
];

const phases = [
  {
    name: 'Discovery',
    detail: 'Map the current state — source systems, owners, the questions people are trying to answer, and where the answers fall apart.',
  },
  {
    name: 'Pilot',
    detail: 'Build the new pipeline and reporting in parallel with what runs today. Compare outputs until they match.',
  },
  {
    name: 'Cutover',
    detail: 'Switch when outputs match, with rollback in place. Hand off the runbook so your team owns it.',
  },
];

const surfaces = [
  'Investment reporting',
  'Portfolio dashboards',
  'Operational reporting',
  'Investor communications',
];

export default function ComprehensiveDataStrategyPage() {
  return (
    <div className="nv-page">
      <header style={{ paddingBottom: 48, borderBottom: '1px solid var(--nv-hair-medium-rgba)' }}>
        <p className="nv-eyebrow">
          <span className="nv-eyebrow-dot" />
          Capability · Data
        </p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24, fontSize: 'clamp(44px, 6vw, 68px)' }}>
          Your data strategy is your <em>AI</em> strategy.
        </h1>
        <p className="nv-lede">
          We design and build the data systems your business actually runs on. From source systems to
          executive reporting, everything is structured, governed, and tied to decisions.
        </p>
        <div style={{ marginTop: 28 }}>
          <NvButton variant="primary" href="/contact?capability=data-strategy">
            Talk through your data stack
          </NvButton>
        </div>
      </header>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow">What this covers</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {coverage.map((item) => (
            <NvCard key={item.title}>
              <h3 className="nv-h3" style={{ marginBottom: 8 }}>{item.title}</h3>
              <p className="nv-body" style={{ margin: 0 }}>{item.detail}</p>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />What changes</p>
        </div>
        <NvCard>
          <ul className="nv-body" style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
            {outcomes.map((line) => (
              <li key={line} style={{ marginBottom: 8 }}>{line}</li>
            ))}
          </ul>
        </NvCard>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow">How it works</p>
          <p className="nv-small" style={{ margin: 0 }}>Discovery · Pilot · Cutover</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {phases.map((phase, idx) => (
            <NvCard key={phase.name}>
              <p className="nv-eyebrow" style={{ marginBottom: 12 }}>{String(idx + 1).padStart(2, '0')}</p>
              <h3 className="nv-h3" style={{ marginBottom: 8 }}>{phase.name}</h3>
              <p className="nv-body" style={{ margin: 0 }}>{phase.detail}</p>
            </NvCard>
          ))}
        </div>
        <p className="nv-body" style={{ marginTop: 20 }}>
          Map the current state. Build in parallel. Switch when outputs match.
        </p>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow">Where this shows up</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {surfaces.map((surface) => (
            <span key={surface} className="nv-pill nv-pill-teal">
              {surface}
            </span>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <NvCard>
          <h2 className="nv-h3" style={{ marginBottom: 12 }}>Start with the question, not the tool.</h2>
          <p className="nv-body" style={{ margin: 0 }}>
            We do not pick a warehouse and reverse-engineer the work. We start from the decisions you need
            to support and build back from there.
          </p>
          <div className="flex flex-wrap gap-3" style={{ marginTop: 24 }}>
            <NvButton variant="primary" href="/contact?capability=data-strategy">
              Start the conversation
            </NvButton>
            <NvButton variant="ghost" href="/what-we-do">
              How we engage
            </NvButton>
          </div>
        </NvCard>
      </section>
    </div>
  );
}
