import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Suspense } from 'react';
import { getAllResearchEntries } from '@/lib/marketing/content';
import { ResearchHubClient } from '@/components/marketing/research/ResearchHubClient';

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
    <section className="space-y-3 rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-5 sm:p-6 xl:sticky xl:top-24">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-nv-teal">Start Here</p>
      <h2 className="text-xl font-semibold tracking-tight text-nv-text">Answer -&gt; Focus -&gt; Differentiate -&gt; Prove -&gt; Publish</h2>
      <div className="space-y-2">
        {START_HERE_STEPS.map((step, index) => (
          <Link
            key={step.label}
            href={step.href}
            className="flex items-center justify-between rounded-xl border border-nv-text/10 bg-nv-bg/80 px-3 py-2 text-sm text-nv-text transition hover:border-nv-teal/25"
          >
            <span>
              {index + 1}. {step.label}
            </span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
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
    <div className="space-y-8 lg:space-y-10">
      <section className="space-y-6 rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-6 sm:p-8 lg:p-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-nv-text sm:text-4xl md:text-5xl">Research</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-nv-muted sm:text-base">
            Clear frameworks for building internal execution without vendor dependency.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {quickEntries.map((entry) => (
            <Link
              key={entry.id}
              href={`/research/${entry.slug}`}
              className="group rounded-2xl border border-nv-text/10 bg-nv-bg/80 p-4 transition hover:border-nv-teal/25"
            >
              <p className="text-base font-semibold text-nv-text">
                {entry.slug === 'positioning' ? 'Positioning Questions' : entry.slug === 'messaging' ? 'Messaging Rules' : 'Website Schemes'}
              </p>
              <p className="mt-2 text-sm text-nv-muted">{entry.summary}</p>
              <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-nv-teal">
                Open
                <ArrowRight size={13} aria-hidden="true" />
              </p>
            </Link>
          ))}
        </div>
      </section>

      <div className="xl:hidden">
        <StartHerePanel />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Suspense
          fallback={
            <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-6 text-sm text-nv-muted">
              Loading research filters...
            </section>
          }
        >
          <ResearchHubClient entries={cards} />
        </Suspense>
        <div className="hidden xl:block">
          <StartHerePanel />
        </div>
      </div>
    </div>
  );
}
