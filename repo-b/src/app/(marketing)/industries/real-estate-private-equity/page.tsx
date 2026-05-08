import type { Metadata } from 'next';
import { HeroBackground } from '@/components/marketing/HeroBackground';
import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import {
  DataPipelineFlow,
  type DataPipelineFlowContent,
} from '@/components/marketing/visual/DataPipelineFlow';
import { fileExistsInPublic } from '@/lib/marketing/publicAssets';

const HERO_BG = '/assets/bg-repe.jpg';

const CALENDAR_HREF =
  'mailto:paul@novendor.ai?subject=Real%20estate%20private%20equity%20%E2%80%94%2030%20minutes';

export const metadata: Metadata = {
  title: 'Make good on your AI promise — Novendor',
  description:
    'We build the AI infrastructure REPE firms committed to — connected to your data, governed for institutional use, delivered by people who know the work.',
  alternates: {
    canonical: '/industries/real-estate-private-equity',
  },
  openGraph: {
    title: 'Make good on your AI promise — Novendor',
    description:
      'We build the AI infrastructure REPE firms committed to — connected to your data, governed for institutional use, delivered by people who know the work.',
    url: 'https://www.novendor.ai/industries/real-estate-private-equity',
    type: 'website',
  },
};

const repeOperatingLayer: DataPipelineFlowContent = {
  aiBannerCopy:
    'Reads your fund data, checks definitions against source records, drafts LP reports, and flags variances against data your team has approved.',
  column1: {
    sources: [
      { name: 'Yardi / MRI', detail: 'Financial and operating records', glyph: 'erp' },
      { name: 'Argus', detail: 'Asset-level underwriting and cash flows', glyph: 'tools' },
      { name: 'Excel models', detail: 'Absorbed into the record, not replaced', glyph: 'files' },
      { name: 'LP portals', detail: 'Capital activity, notices, distributions', glyph: 'cloud' },
      { name: 'Third-party feeds', detail: 'Market data, benchmarks, CoStar', glyph: 'crm' },
    ],
  },
  column3: {
    items: [
      'Data warehouse design for fund, asset, and deal level',
      'Modern lakehouse on Databricks, Snowflake, or Azure',
      'Modeled around the questions your IC and LPs actually ask',
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
      { label: 'Metrics & definitions', tone: 'teal' },
      { label: 'Waterfall logic', tone: 'copper' },
      { label: 'Access & security', tone: 'warning' },
      { label: 'Data quality', tone: 'success' },
    ],
    items: [
      'IRR means the same thing everywhere',
      'Waterfall logic defined once, applied consistently',
      'Lineage, validation, and audit trail',
    ],
  },
  column5: {
    users: [
      { name: 'Partners', detail: 'Fund-level view, IC-ready', glyph: 'exec' },
      { name: 'Asset managers', detail: 'Property-level, variance vs. budget', glyph: 'ops' },
      { name: 'Analysts', detail: 'Self-serve with trusted data', glyph: 'analyst' },
      { name: 'LP reporting', detail: 'Generated in hours, not assembled over days', glyph: 'report' },
      { name: 'AI agents', detail: 'Draft, check, and execute against governed data', glyph: 'agent' },
    ],
  },
};

const sourceStrip = [
  'Yardi / MRI',
  'Argus',
  'Excel models',
  'LP reporting',
  'IC packs',
  'Fund and asset reporting',
];

const whoFor = [
  {
    title: 'The firm under new ownership',
    body:
      'A parent company or institutional platform now expects standardized quarterly data. The existing stack was built for internal reporting. The gap shows up every quarter-end.',
  },
  {
    title: 'The firm that made the promise',
    body:
      'Leadership told LPs or the board that AI is part of the strategy. The ops team or a senior analyst got the assignment. They need something real that survives a follow-up question.',
  },
  {
    title: 'The firm where one analyst owns everything',
    body:
      'The model, the reporting, and the quarterly pack sit with one person. One departure creates risk. The goal is to make the work reproducible.',
  },
];

const proof = [
  {
    title: 'Built the layer',
    body:
      'Mid-market REPE firm, approximately $3B AUM, 18-person team. Yardi and Excel were the starting point. We replaced analyst-built LP packs with a reporting layer that pulled directly from source systems. Quarterly IC memo prep went from two days to four hours. The firm passed an LP audit without material reconciliation issues.',
  },
  {
    title: 'Stayed in Excel',
    body:
      'A larger shop was acquired by a global asset management platform. The analyst who owned the model left. The new hire could not reproduce it. An LP audit surfaced three inconsistencies across reporting periods. Remediation took two months. The parent company installed its own oversight layer.',
  },
];

export default function RealEstatePrivateEquityPage() {
  const bgSrc = fileExistsInPublic(HERO_BG) ? HERO_BG : undefined;

  return (
    <>
      <HeroBackground imageSrc={bgSrc} imageAlt="" overlayOpacity={0.45}>
        <p className="nv-eyebrow">
          <span className="nv-eyebrow-dot" />
          Real estate private equity
        </p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24 }}>
          Make good on your AI <em>promise</em>.
        </h1>
        <p className="nv-lede">
          You told your LPs, your IC, or your board that AI is part of the strategy. We build the
          infrastructure that makes that true — connected to your actual data, governed for
          institutional use, and delivered by people who know how REPE works.
        </p>
        <div style={{ marginTop: 28 }}>
          <NvButton variant="primary" href={CALENDAR_HREF}>
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
            The commitment is made. The infrastructure is missing.
          </h2>
          <p className="nv-lede" style={{ maxWidth: 760, margin: 0 }}>
            Most REPE firms run on Yardi or MRI as the source and Excel as the integration layer.
            One analyst owns the model and the institutional memory behind it. When a parent
            company, an LP, or a new partner asks for standardized data, that analyst works the
            weekend. AI needs governed data, repeatable logic, and outputs the firm can defend.
          </p>
        </section>

        <section className="nv-section" aria-label="AI operating layer">
          <div className="nv-section-head">
            <p className="nv-eyebrow">The operating layer</p>
          </div>
          <DataPipelineFlow content={repeOperatingLayer} />
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
            The difference was infrastructure that existed outside one person&rsquo;s workbook.
          </p>
        </section>

        <section className="nv-section" aria-label="Final call to action">
          <NvCard>
            <h2 className="nv-h3" style={{ marginBottom: 12 }}>
              If your quarterly LP pack still lives in Excel, let&rsquo;s talk.
            </h2>
            <p className="nv-body" style={{ margin: 0 }}>
              In 30 minutes, we&rsquo;ll map what you have, what you promised, and what it takes to
              close the gap.
            </p>
            <div style={{ marginTop: 24 }}>
              <NvButton variant="primary" href={CALENDAR_HREF}>
                Book the conversation →
              </NvButton>
            </div>
          </NvCard>
        </section>
      </div>
    </>
  );
}
