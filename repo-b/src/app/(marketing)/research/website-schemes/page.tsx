import type { Metadata } from 'next';
import { getResearchBySlug } from '@/lib/marketing/content';
import { OnThisPageDesktop, OnThisPageMobile } from '@/components/marketing/research/OnThisPage';
import { WebsiteSchemesTabs } from '@/components/marketing/research/WebsiteSchemesTabs';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { PageHeader } from '@/components/marketing/ui/PageHeader';

type CalloutSection = {
  type: 'callout';
  title: string;
  body: string;
};

export const metadata: Metadata = {
  title: 'Website Schemes',
  description: 'Comparison of four narrative structures for capability-first websites.'
};

const ON_PAGE_LINKS = [{ id: 'schemes', label: 'Scheme Comparison' }] as const;

export default function ResearchWebsiteSchemesPage() {
  const entry = getResearchBySlug('website-schemes');
  const callout = entry.sections.find((section) => section.type === 'callout') as CalloutSection | undefined;

  return (
    <div className="nv-page">
      <PageHeader
        eyebrow="Research / Website"
        headline={entry.title}
        lede={entry.summary}
      >
        {callout && (
          <NvCard padded={false} className="mt-6 p-4" liftOnHover={false}>
            <p className="nv-eyebrow" style={{ color: 'rgb(var(--nv-accent-teal))' }}>{callout.title}</p>
            <p className="nv-body" style={{ marginTop: 4, color: 'rgb(var(--nv-accent-teal))' }}>{callout.body}</p>
          </NvCard>
        )}
      </PageHeader>

      <div className="nv-section">
        <OnThisPageMobile links={[...ON_PAGE_LINKS]} />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <WebsiteSchemesTabs entry={entry} />
          <OnThisPageDesktop links={[...ON_PAGE_LINKS]} />
        </div>
      </div>
    </div>
  );
}
