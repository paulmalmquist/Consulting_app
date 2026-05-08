import type { Metadata } from 'next';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { NvButton } from '@/components/marketing/ui/NvButton';
import { DataPipelineFlow } from '@/components/marketing/visual/DataPipelineFlow';
import { HeroBackground } from '@/components/marketing/HeroBackground';
import { fileExistsInPublic } from '@/lib/marketing/publicAssets';

const HERO_BG = '/assets/bg-data-strategy.jpg';

export const metadata: Metadata = {
  title: 'What We Do | Novendor',
  description:
    'We design and build the data systems your business actually runs on — from source systems to executive reporting, structured, governed, and tied to decisions.',
  alternates: { canonical: '/what-we-do' },
  openGraph: {
    title: 'What We Do | Novendor',
    description:
      'We design and build the data systems your business actually runs on — from source systems to executive reporting, structured, governed, and tied to decisions.',
    url: 'https://www.novendor.ai/what-we-do',
    type: 'website',
  },
};

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

export default function WhatWeDoPage() {
  const bgSrc = fileExistsInPublic(HERO_BG) ? HERO_BG : undefined;

  return (
    <>
      <HeroBackground imageSrc={bgSrc} imageAlt="" overlayOpacity={0.45}>
        <p className="nv-eyebrow">
          <span className="nv-eyebrow-dot" />
          What we do
        </p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24 }}>
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
      </HeroBackground>

      <div className="nv-page nv-page--wide" style={{ paddingTop: 0 }}>
        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow">What this covers</p>
          </div>
          <DataPipelineFlow />
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
              <NvButton variant="ghost" href="/operational-assessment">
                Get an AI-readiness review
              </NvButton>
            </div>
          </NvCard>
        </section>
      </div>
    </>
  );
}
