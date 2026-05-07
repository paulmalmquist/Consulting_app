import type { Metadata } from 'next';
import { HeroBackground } from '@/components/marketing/HeroBackground';
import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import {
  DataPipelineFlow,
  type DataPipelineFlowContent,
} from '@/components/marketing/visual/DataPipelineFlow';
import { fileExistsInPublic } from '@/lib/marketing/publicAssets';

const HERO_BG = '/assets/bg-legal.jpg';

// Replace with Calendly URL when available.
const CONTACT_LINK =
  'mailto:paul@novendor.ai?subject=Legal%20operations%20%E2%80%94%2030%20minutes';

export const metadata: Metadata = {
  title: 'Get the legal record straight — Novendor',
  description:
    'We build governed operating layers for legal teams across matters, contracts, billing narratives, intake logic, approval rules, and outside counsel workflows.',
  alternates: {
    canonical: '/industries/legal',
  },
  openGraph: {
    title: 'Get the legal record straight — Novendor',
    description:
      'We build governed operating layers for legal teams across matters, contracts, billing narratives, intake logic, approval rules, and outside counsel workflows.',
    url: 'https://www.novendor.ai/industries/legal',
    type: 'website',
  },
};

const operatingLayer: DataPipelineFlowContent = {
  aiBannerCopy:
    'Reads matters, intake, contracts, billing narratives, playbooks, approvals, and outside counsel records; checks them against approved positions; drafts summaries and review packets; and flags exceptions against records your team has approved.',
  column1: {
    sources: [
      {
        name: 'Matter management',
        detail: 'Matters, owners, status, spend',
        glyph: 'erp',
      },
      {
        name: 'CLM / contract repos',
        detail: 'Agreements, clauses, redlines',
        glyph: 'files',
      },
      {
        name: 'Intake forms & inboxes',
        detail: 'Requests, facts, routing',
        glyph: 'crm',
      },
      {
        name: 'Billing systems',
        detail: 'Narratives, time entries, outside counsel spend',
        glyph: 'tools',
      },
      {
        name: 'Playbooks & policies',
        detail: 'Approved positions, fallback language, approval rules',
        glyph: 'cloud',
      },
    ],
  },
  column2: {
    items: [
      'Pull from matter, contract, billing, intake, and policy sources',
      'Normalize matter, request, clause, approval, and spend records',
      'Track state, handoffs, missing facts, and source freshness',
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
      'Data model for matters, contracts, clauses, requests, approvals, and spend',
      'Warehouse on Databricks, Snowflake, Azure, or your existing cloud stack',
      'Modeled around legal intake, review status, risk, cost, and precedent',
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
      { label: 'Approved positions', tone: 'teal' },
      { label: 'Approval rules', tone: 'copper' },
      { label: 'Privilege & access', tone: 'warning' },
      { label: 'Audit trail', tone: 'success' },
    ],
    items: [
      'Approved positions, fallback language, matter taxonomy, and risk levels defined once',
      'Access controls for privileged and sensitive records',
      'Lineage from summary or packet to source record, with audit trail for decisions and handoffs',
    ],
  },
  column5: {
    users: [
      {
        name: 'General counsel',
        detail: 'Matter risk, spend, and decision visibility',
        glyph: 'exec',
      },
      {
        name: 'Legal ops',
        detail: 'Intake, routing, SLAs, and outside counsel control',
        glyph: 'ops',
      },
      {
        name: 'Attorneys',
        detail: 'Approved positions and prior decisions in context',
        glyph: 'analyst',
      },
      {
        name: 'Finance',
        detail: 'Billing narratives and spend reporting',
        glyph: 'report',
      },
      {
        name: 'AI agents',
        detail: 'Draft, check, and summarize against governed legal memory',
        glyph: 'agent',
      },
    ],
  },
};

const sourceStrip = [
  'Matter management',
  'CLM',
  'Intake',
  'Billing',
  'Playbooks',
  'Outside counsel',
];

const whoFor = [
  {
    title: 'The legal team buried in intake',
    body:
      'Requests arrive through forms, email, Slack, and hallway conversations. The same facts get re-entered. Status updates depend on whichever attorney remembers the matter.',
  },
  {
    title: 'The GC controlling outside counsel and spend',
    body:
      'Billing narratives, matter status, risk, and outcomes live in different places. Finance can see spend, and legal needs the decision record behind the work to act on it.',
  },
  {
    title: 'The team experimenting with legal AI',
    body:
      'Attorneys are trying AI for drafts and summaries. The firm needs approved positions, playbooks, prior decisions, and review rules in one governed record before scaling usage.',
  },
];

const proof = [
  {
    title: 'Operating pattern',
    body:
      'A legal operations team with intake, matter status, billing narratives, and playbook guidance spread across email, trackers, and point systems models requests, matters, approvals, and outside counsel handoffs into a governed record. Legal leadership gains visibility into work, spend, and recurring issues without asking attorneys for manual updates.',
  },
  {
    title: 'Common failure mode',
    body:
      'A legal team rolls out AI drafting before centralizing playbooks, positions, approvals, and prior decisions. Outputs vary by user. Attorneys still inspect every answer manually because the system has no governed legal memory behind it.',
  },
];

export default function LegalPage() {
  const bgSrc = fileExistsInPublic(HERO_BG) ? HERO_BG : undefined;

  return (
    <>
      <HeroBackground imageSrc={bgSrc} imageAlt="" overlayOpacity={0.45}>
        <p className="nv-eyebrow">
          <span className="nv-eyebrow-dot" />
          Legal operations
        </p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24 }}>
          Get the legal <em>record</em> straight.
        </h1>
        <p className="nv-lede">
          Matter data, intake logic, contract positions, billing narratives, approvals, and
          outside counsel work need one governed record before AI can safely help. Novendor
          builds the operating layer that makes legal work traceable, repeatable, and easier to
          review.
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
            Legal work leaves a record. The record is hard to use.
          </h2>
          <p className="nv-lede" style={{ maxWidth: 760, margin: 0 }}>
            Legal teams already have matters, contracts, policies, playbooks, billing narratives,
            approvals, and outside counsel notes. The logic behind the work is spread across
            documents, inboxes, point tools, and attorney memory. AI can draft and summarize, and
            legal teams need a governed record of what was requested, what position was taken,
            who approved it, and why.
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
            The risk comes from using AI without a trusted record.
          </p>
        </section>

        <section className="nv-section" aria-label="Final call to action">
          <NvCard>
            <h2 className="nv-h3" style={{ marginBottom: 12 }}>
              If legal AI still depends on scattered playbooks and attorney memory, let&rsquo;s
              talk.
            </h2>
            <p className="nv-body" style={{ margin: 0 }}>
              In 30 minutes, we&rsquo;ll map your matters, intake, approvals, billing narratives,
              and playbooks into the operating layer legal teams need before scaling AI.
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
