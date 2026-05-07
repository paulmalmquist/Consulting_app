import type { Metadata } from 'next';
import { HeroBackground } from '@/components/marketing/HeroBackground';
import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import {
  DataPipelineFlow,
  type DataPipelineFlowContent,
} from '@/components/marketing/visual/DataPipelineFlow';
import { fileExistsInPublic } from '@/lib/marketing/publicAssets';

const HERO_BG = '/assets/bg-medical.jpg';

// Replace with Calendly URL when available.
const CONTACT_LINK =
  'mailto:paul@novendor.ai?subject=Healthcare%20operations%20%E2%80%94%2030%20minutes';

export const metadata: Metadata = {
  title: 'Denials move faster when the data is together — Novendor',
  description:
    'We build governed operating layers for healthcare teams dealing with prior auth, denials, payer portals, clinical records, and reimbursement workflows.',
  alternates: {
    canonical: '/industries/medical',
  },
  openGraph: {
    title: 'Denials move faster when the data is together — Novendor',
    description:
      'We build governed operating layers for healthcare teams dealing with prior auth, denials, payer portals, clinical records, and reimbursement workflows.',
    url: 'https://www.novendor.ai/industries/medical',
    type: 'website',
  },
};

const operatingLayer: DataPipelineFlowContent = {
  aiBannerCopy:
    'Reads prior auth, denial, claim, payer, clinical, and appeal records; checks them against approved rules; drafts work queue summaries and appeal packets; and flags missing evidence against records your team has approved.',
  column1: {
    sources: [
      {
        name: 'EHR / EMR',
        detail: 'Clinical documentation, encounter records',
        glyph: 'erp',
      },
      {
        name: 'Practice mgmt / RCM',
        detail: 'Claims, balances, billing status',
        glyph: 'tools',
      },
      {
        name: 'Payer portals',
        detail: 'Authorization, denial, appeal status',
        glyph: 'cloud',
      },
      {
        name: 'Clearinghouse feeds',
        detail: 'Claim submission and remittance',
        glyph: 'crm',
      },
      {
        name: 'Coding & documentation',
        detail: 'CPT, ICD, modifiers, notes',
        glyph: 'files',
      },
    ],
  },
  column2: {
    items: [
      'Pull from EHR, RCM, payer, clearinghouse, and queue sources',
      'Normalize patient, encounter, claim, authorization, denial, and appeal records',
      'Absorb Excel queues into the governed workflow record with state, retries, and freshness',
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
      'Data model for auth, claim, denial, appeal, payer, and encounter',
      'Warehouse on Databricks, Snowflake, Azure, or your existing cloud stack',
      'Modeled around backlog, payer behavior, recovery, and operational throughput',
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
      { label: 'Definitions & rules', tone: 'teal' },
      { label: 'Payer logic', tone: 'copper' },
      { label: 'PHI access', tone: 'warning' },
      { label: 'Data quality', tone: 'success' },
    ],
    items: [
      'Denial reason, appeal status, authorization status, and payer rule definitions',
      'Role-based access and PHI-aware handling',
      'Lineage from work queue to source record, plus audit trail for actions and handoffs',
    ],
  },
  column5: {
    users: [
      {
        name: 'Revenue cycle leaders',
        detail: 'Backlog, recovery, and payer trends',
        glyph: 'exec',
      },
      {
        name: 'Denials teams',
        detail: 'Prioritized queue, missing evidence, clinical documentation handoffs',
        glyph: 'ops',
      },
      { name: 'Analysts', detail: 'Trusted operational reporting', glyph: 'analyst' },
      { name: 'Compliance', detail: 'Traceable record of work performed', glyph: 'report' },
      {
        name: 'AI agents',
        detail: 'Draft, check, and summarize against approved records',
        glyph: 'agent',
      },
    ],
  },
};

const sourceStrip = [
  'EHR / EMR',
  'RCM',
  'Payer portals',
  'Clearinghouse',
  'Coding tools',
  'Appeal packets',
];

const whoFor = [
  {
    title: 'The provider drowning in denial work',
    body:
      'Denials, appeals, and payer follow-up sit across portals and spreadsheets. The team can see the backlog, and root-cause reporting takes too long to get to action.',
  },
  {
    title: 'The RCM team standardizing payer handling',
    body:
      'Each payer behaves differently. Rules, portals, documents, and appeal timing vary. The team needs a governed record that shows what happened and what to do next.',
  },
  {
    title: 'The organization adding AI to operations',
    body:
      'Leadership wants AI to reduce manual work. The records that support that work still live across EHR, RCM, payer portals, and queues, and need to come together first.',
  },
];

const proof = [
  {
    title: 'Operating pattern',
    body:
      'A healthcare operations team with denial status, payer responses, and appeal work spread across portals and spreadsheets connects the source records, models denial and appeal status, and stands up governed work queues. Managers see backlog, missing evidence, and payer trends without waiting for manual consolidation.',
  },
  {
    title: 'Common failure mode',
    body:
      'A provider attacks denials with manual exports and payer-portal screenshots. Appeal packets vary by analyst. Root-cause reporting lags the work by weeks. Leadership can see the backlog with no clean way to isolate where it is coming from.',
  },
];

export default function MedicalPage() {
  const bgSrc = fileExistsInPublic(HERO_BG) ? HERO_BG : undefined;

  return (
    <>
      <HeroBackground imageSrc={bgSrc} imageAlt="" overlayOpacity={0.45}>
        <p className="nv-eyebrow">
          <span className="nv-eyebrow-dot" />
          Healthcare operations
        </p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24 }}>
          Denials move faster when the <em>data is together</em>.
        </h1>
        <p className="nv-lede">
          Prior auth, denials, claims, payer rules, clinical notes, and appeal status often live
          across portals, spreadsheets, and queues. Novendor builds the operating layer that
          connects the record, governs the definitions, and gives operations teams a faster path
          from denial to action.
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
            The backlog is visible. The root cause is buried.
          </h2>
          <p className="nv-lede" style={{ maxWidth: 760, margin: 0 }}>
            Healthcare teams know where the work piles up: prior auth, denials, appeals,
            documentation gaps, payer-specific rules, and manual follow-up. The harder problem is
            seeing the full record across systems. A denial may depend on clinical documentation,
            coding, payer policy, authorization status, and appeal history. AI helps once that
            record is connected and approved.
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
            The speed comes from a connected record, ahead of any new dashboard.
          </p>
        </section>

        <section className="nv-section" aria-label="Final call to action">
          <NvCard>
            <h2 className="nv-h3" style={{ marginBottom: 12 }}>
              If your denial backlog lives across portals and spreadsheets, let&rsquo;s talk.
            </h2>
            <p className="nv-body" style={{ margin: 0 }}>
              In 30 minutes, we&rsquo;ll map your payer, claim, auth, denial, and appeal records
              and identify where the operating layer needs to be built.
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
