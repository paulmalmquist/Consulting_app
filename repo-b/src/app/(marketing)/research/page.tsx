import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Suspense } from 'react';
import { getAllResearchEntries } from '@/lib/marketing/content';
import { ResearchHubClient } from '@/components/marketing/research/ResearchHubClient';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { PageHeader } from '@/components/marketing/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Research',
  description: 'Clear frameworks for building internal execution without vendor dependency.'
};

const QUICK_ENTRY_SLUGS = ['positioning', 'messaging', 'website-schemes'] as const;

const START_HERE_STEPS = [
  { label: 'Answer', href: '/research/positioning#eight-questions' },
  { label: 'Focus', href: '/research/positioning#follow-on-paths' },
  { label: 'Differentiate', href: '/research/messaging#rules' },
  { label: 'Prove', href: '/research/examples#proof-patterns' },
  { label: 'Publish', href: '/research/website-schemes#schemes' }
] as const;

function StartHerePanel() {
  return (
    <NvCard>
      <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Start here</p>
      <h2 className="nv-h3" style={{ marginTop: 12, marginBottom: 16 }}>Answer → Focus → Differentiate → Prove → Publish</h2>
      <div className="space-y-2">
        {START_HERE_STEPS.map((step, index) => (
          <Link
            key={step.label}
            href={step.href}
            className="flex items-center justify-between rounded-[4px] border border-[rgb(var(--nv-hair-soft)/0.08)] bg-[rgb(var(--nv-bg)/0.6)] px-3 py-2 text-sm text-[rgb(var(--nv-text-primary))] transition hover:border-[rgb(var(--nv-accent-teal)/0.25)]"
          >
            <span>{index + 1}. {step.label}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </NvCard>
  );
}

export default function ResearchPage() {
  const entries = getAllResearchEntries();

  const quickEntries = QUICK_ENTRY_SLUGS
    .map((slug) => entries.find((entry) => entry.slug === slug))
    .filter((entry): entry is NonNullable<(typeof entries)[number]> => Boolean(entry));

  const cards = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    slug: entry.slug,
    summary: entry.summary,
    tags: entry.tags,
    audience: entry.audience,
    maturity: entry.maturity
  }));

  return (
    <div className="nv-page">
      <PageHeader
        eyebrow="Research"
        headline="Research"
        lede="Clear frameworks for building internal execution without vendor dependency."
      />

      <section className="nv-section">
        <div className="grid gap-4 md:grid-cols-3">
          {quickEntries.map((entry) => (
            <Link key={entry.id} href={`/research/${entry.slug}`} className="block">
              <NvCard liftOnHover>
                <p className="nv-h3">
                  {entry.slug === 'positioning' ? 'Positioning Questions' : entry.slug === 'messaging' ? 'Messaging Rules' : 'Website Schemes'}
                </p>
                <p className="nv-body">{entry.summary}</p>
                <p className="nv-eyebrow" style={{ marginTop: 16, color: 'rgb(var(--nv-accent-teal))' }}>
                  Open <ArrowRight size={12} style={{ display: 'inline', verticalAlign: 'middle' }} aria-hidden="true" />
                </p>
              </NvCard>
            </Link>
          ))}
        </div>
      </section>

      <div className="xl:hidden nv-section">
        <StartHerePanel />
      </div>

      <section className="nv-section">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Suspense
            fallback={
              <NvCard>
                <p className="nv-body" style={{ margin: 0 }}>Loading research filters...</p>
              </NvCard>
            }
          >
            <ResearchHubClient entries={cards} />
          </Suspense>
          <div className="hidden xl:block">
            <StartHerePanel />
          </div>
        </div>
      </section>
    </div>
  );
}
