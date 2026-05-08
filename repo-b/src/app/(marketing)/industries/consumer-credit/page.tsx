import type { Metadata } from 'next';
import { HeroBackground } from '@/components/marketing/HeroBackground';
import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import {
  DataPipelineFlow,
  type DataPipelineFlowContent,
} from '@/components/marketing/visual/DataPipelineFlow';
import { fileExistsInPublic } from '@/lib/marketing/publicAssets';

const HERO_BG = '/assets/bg-consumer.jpg';

// Replace with Calendly URL when available.
const CONTACT_LINK =
  'mailto:paul@novendor.ai?subject=Consumer%20credit%20%E2%80%94%2030%20minutes';

export const metadata: Metadata = {
  title: 'Get decision data AI-ready and examiner-readable — Novendor',
  description:
    'We build governed data infrastructure for consumer credit teams — connected to loan systems, policy rules, decision records, servicing data, and audit-ready reporting.',
  alternates: {
    canonical: '/industries/consumer-credit',
  },
  openGraph: {
    title: 'Get decision data AI-ready and examiner-readable — Novendor',
    description:
      'We build governed data infrastructure for consumer credit teams — connected to loan systems, policy rules, decision records, servicing data, and audit-ready reporting.',
    url: 'https://www.novendor.ai/industries/consumer-credit',
    type: 'website',
  },
};

const operatingLayer: DataPipelineFlowContent = {
  aiBannerCopy:
    'Reads applications, decisions, servicing events, complaints, and policy rules; checks them against approved definitions; drafts risk and compliance outputs; and flags exceptions against records your team has approved.',
  column1: {
    sources: [
      {
        name: 'Loan origination',
        detail: 'Applications, offers, approvals, declines',
        glyph: 'erp',
      },
      {
        name: 'Decision engine',
        detail: 'Policy rules, scorecards, overrides',
        glyph: 'tools',
      },
      {
        name: 'Bureau & KYC',
        detail: 'Attributes, identity, fraud signals',
        glyph: 'cloud',
      },
      {
        name: 'Servicing platform',
        detail: 'Payment history, hardship, collections',
        glyph: 'erp',
      },
      {
        name: 'Complaints & disputes',
        detail: 'CFPB, internal queues, vendor portals',
        glyph: 'crm',
      },
    ],
  },
  column2: {
    items: [
      'Pull from origination, decisioning, servicing, and compliance sources',
      'Normalize applicant, account, decision, and event records',
      'Track state, retries, exceptions, and source freshness',
    ],
    foot: (
      <>
        Records move reliably.
        <br />
        Owned end to end.
      </>
    ),
  },
  column3: {
    items: [
      'Data model for application, decision, account, borrower, and servicing events',
      'Warehouse on Databricks, Snowflake, Azure, or your existing cloud stack',
      'Modeled around risk, compliance, examiner, and partner-bank questions',
    ],
    foot: (
      <>
        Structured. Modeled.
        <br />
        Built for decisions.
      </>
    ),
  },
  column4: {
    govTiles: [
      { label: 'Policy & definitions', tone: 'teal' },
      { label: 'Decision logic', tone: 'copper' },
      { label: 'Access & PII', tone: 'warning' },
      { label: 'Data quality', tone: 'success' },
    ],
    items: [
      'Policy definitions tied to decision records, including which rule version applied',
      'Approval, decline, adverse action, exception, and override logic defined once',
      'Role-based access, lineage from output to source, audit trail for overrides',
    ],
  },
  column5: {
    users: [
      { name: 'Risk leaders', detail: 'Portfolio and policy performance', glyph: 'exec' },
      {
        name: 'Compliance',
        detail: 'Examiner-ready record, evidence, and partner-bank packages',
        glyph: 'report',
      },
      { name: 'Operations', detail: 'Queues, exceptions, and SLA views', glyph: 'ops' },
      { name: 'Analysts', detail: 'Trusted self-serve decision data', glyph: 'analyst' },
      {
        name: 'AI agents',
        detail: 'Draft, check, and summarize against governed records',
        glyph: 'agent',
      },
    ],
  },
};

const sourceStrip = [
  'Loan origination',
  'Decision engine',
  'Bureau & KYC',
  'Servicing',
  'Complaints',
  'Examiner reporting',
];

const whoFor = [
  {
    title: 'The lender preparing for examiner scrutiny',
    body:
      'A regulator, partner bank, or internal audit team needs a clear record of decisions, exceptions, complaints, and policy logic. The data exists today, and the evidence trail takes too much manual work to assemble.',
  },
  {
    title: 'The team changing credit policy',
    body:
      'Policy is moving faster than the reporting layer. Analysts are comparing vintages, score bands, exceptions, and overrides across exports, with no governed record of what changed and when.',
  },
  {
    title: 'The firm with too many manual reconciliations',
    body:
      'Origination, decisioning, servicing, and compliance teams each trust their own export. Quarter-end and audit requests turn into spreadsheet archaeology.',
  },
];

const proof = [
  {
    title: 'Operating pattern',
    body:
      'A specialty lender with application, decision, and servicing data split across the LOS, decision engine, and warehouse extracts builds a governed decision record that ties policy definitions to outcomes and feeds examiner-ready reporting views. Audit preparation moves from manual file pulls to reusable evidence packages.',
  },
  {
    title: 'Common failure mode',
    body:
      'A lender changes policy rules across multiple products with no single governed decision record. Compliance can report outcomes, with no clean way to explain which rule version applied to each decision. A partner-bank review turns into weeks of reconstruction.',
  },
];

export default function ConsumerCreditPage() {
  const bgSrc = fileExistsInPublic(HERO_BG) ? HERO_BG : undefined;

  return (
    <>
      <HeroBackground imageSrc={bgSrc} imageAlt="" overlayOpacity={0.45}>
        <p className="nv-eyebrow">
          <span className="nv-eyebrow-dot" />
          Consumer credit
        </p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24 }}>
          Get decision data <em>AI-ready</em> and examiner-readable.
        </h1>
        <p className="nv-lede">
          Your credit policy, decision data, servicing records, and exceptions need to tell the
          same story. Novendor builds the operating layer that connects those records, governs the
          definitions, and gives risk, compliance, and operations teams answers they can defend.
        </p>
        <div style={{ marginTop: 28 }}>
          <NvButton variant="primary" href={CONTACT_LINK}>
            Book 30 minutes →
          </NvButton>
        </div>
        <ul
          aria-label="Systems we work with"
          style={{
            marginTop: 32,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 18px',
            fontFamily: 'var(--font-marketing-mono), ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgb(var(--nv-text-tertiary))',
          }}
        >
          {sourceStrip.map((item, idx) => (
            <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <span>{item}</span>
              {idx < sourceStrip.length - 1 ? (
                <span aria-hidden style={{ color: 'rgb(var(--nv-text-muted))' }}>
                  ·
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </HeroBackground>

      <div className="nv-page nv-page--wide" style={{ paddingTop: 0 }}>
        <section className="nv-section" aria-label="The situation">
          <div className="nv-section-head">
            <p className="nv-eyebrow">
              <span className="nv-eyebrow-dot" />
              The situation
            </p>
          </div>
          <h2 className="nv-h2" style={{ marginBottom: 16 }}>
            The data exists. The record is scattered.
          </h2>
          <p className="nv-lede" style={{ maxWidth: 760, margin: 0 }}>
            Consumer credit teams already have the ingredients: application data, bureau
            attributes, credit policy, decision outcomes, servicing events, complaints, and
            exceptions. Each record lives in a different place. When an examiner, partner bank,
            or risk committee asks why a decision was made, the answer often requires screenshots,
            exports, and analyst reconstruction. AI helps once the underlying record is complete
            enough to inspect.
          </p>
        </section>

        <section className="nv-section" aria-label="AI operating layer">
          <div className="nv-section-head">
            <p className="nv-eyebrow">The operating layer</p>
          </div>
          <DataPipelineFlow content={operatingLayer} />
        </section>

        <section className="nv-section" aria-label="Who this is for">
          <div className="nv-section-head">
            <p className="nv-eyebrow">Who this is for</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {whoFor.map((card) => (
              <NvCard key={card.title}>
                <h3 className="nv-h3" style={{ marginBottom: 12 }}>
                  {card.title}
                </h3>
                <p className="nv-body" style={{ margin: 0 }}>
                  {card.body}
                </p>
              </NvCard>
            ))}
          </div>
        </section>

        <section className="nv-section" aria-label="Proof">
          <div className="nv-section-head">
            <p className="nv-eyebrow">Proof</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {proof.map((card) => (
              <NvCard key={card.title}>
                <p className="nv-eyebrow" style={{ marginBottom: 12 }}>
                  {card.title}
                </p>
                <p className="nv-body" style={{ margin: 0 }}>
                  {card.body}
                </p>
              </NvCard>
            ))}
          </div>
          <p
            className="nv-body"
            style={{ marginTop: 24, color: 'rgb(var(--nv-text-secondary))' }}
          >
            The issue is whether the decision record can be trusted.
          </p>
        </section>

        <section className="nv-section" aria-label="Final call to action">
          <NvCard>
            <h2 className="nv-h3" style={{ marginBottom: 12 }}>
              If your credit decisions require reconstruction, let&rsquo;s talk.
            </h2>
            <p className="nv-body" style={{ margin: 0 }}>
              In 30 minutes, we&rsquo;ll map your systems, decision records, policy definitions,
              and the gaps that keep risk and compliance teams working from exports.
            </p>
            <div style={{ marginTop: 24 }}>
              <NvButton variant="primary" href={CONTACT_LINK}>
                Book the conversation →
              </NvButton>
            </div>
          </NvCard>
        </section>
      </div>
    </>
  );
}
