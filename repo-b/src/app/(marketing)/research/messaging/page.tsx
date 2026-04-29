import type { Metadata } from 'next';
import { getResearchBySlug } from '@/lib/marketing/content';
import { OnThisPageDesktop, OnThisPageMobile } from '@/components/marketing/research/OnThisPage';
import { MessagingRulebook } from '@/components/marketing/research/MessagingRulebook';
import { NvCard } from '@/components/marketing/ui/NvCard';

type CalloutSection = {
  type: 'callout';
  title: string;
  body: string;
};

export const metadata: Metadata = {
  title: 'Messaging Rules',
  description: 'Rulebook and mini checker for clear, enterprise-safe positioning and website copy.',
};

const ON_PAGE_LINKS = [
  { id: 'rules', label: 'Messaging Rules' },
  { id: 'checker', label: 'Message Checker' },
] as const;

export default function ResearchMessagingPage() {
  const entry = getResearchBySlug('messaging');
  const callout = entry.sections.find((section) => section.type === 'callout') as
    | CalloutSection
    | undefined;

  return (
    <div className="nv-page">
      <header style={{ paddingBottom: 48, borderBottom: '1px solid var(--nv-hair-medium-rgba)' }}>
        <p className="nv-eyebrow">
          <span className="nv-eyebrow-dot" />
          Research · Messaging
        </p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24, fontSize: 'clamp(44px, 6vw, 68px)' }}>
          {entry.title}
        </h1>
        <p className="nv-lede">{entry.summary}</p>
        {callout && (
          <NvCard padded style={{ marginTop: 24 }}>
            <p className="nv-eyebrow" style={{ marginBottom: 8, color: 'rgb(var(--nv-accent-teal))' }}>
              {callout.title}
            </p>
            <p className="nv-body" style={{ margin: 0, color: 'rgb(var(--nv-accent-teal))' }}>
              {callout.body}
            </p>
          </NvCard>
        )}
      </header>

      <OnThisPageMobile links={[...ON_PAGE_LINKS]} />

      <div className="nv-section grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <MessagingRulebook entry={entry} />
        <OnThisPageDesktop links={[...ON_PAGE_LINKS]} />
      </div>
    </div>
  );
}
