import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { IndustryVerticalPage } from '@/components/marketing/industries/IndustryVerticalPage';
import { INDUSTRY_VERTICAL_BY_SLUG, INDUSTRY_VERTICALS, type IndustryVertical } from '@content/industry-verticals';

type IndustryPageProps = {
  params: {
    slug: string;
  };
};

const BESPOKE_INDUSTRY_SLUGS = new Set([
  'real-estate-private-equity',
  'consumer-credit',
  'medical',
  'legal',
  'trades',
]);

export function generateStaticParams() {
  return INDUSTRY_VERTICALS
    .filter((industry) => !BESPOKE_INDUSTRY_SLUGS.has(industry.slug))
    .map((industry) => ({ slug: industry.slug }));
}

export function generateMetadata({ params }: IndustryPageProps): Metadata {
  const industry = INDUSTRY_VERTICAL_BY_SLUG[params.slug as IndustryVertical['slug']];

  if (!industry) {
    return {
      title: 'Industry Not Found | Novendor'
    };
  }

  const description = `Operational AI for ${industry.label.toLowerCase()} workflows with fixed-scope execution and measurable outcomes.`;

  return {
    title: `${industry.label} | Industry Engagement | Novendor`,
    description,
    alternates: {
      canonical: `/industries/${industry.slug}`
    },
    openGraph: {
      title: `${industry.label} | Novendor`,
      description
    }
  };
}

export default function IndustryPage({ params }: IndustryPageProps) {
  const industry = INDUSTRY_VERTICAL_BY_SLUG[params.slug as IndustryVertical['slug']];

  if (!industry) {
    notFound();
  }

  return <IndustryVerticalPage industry={industry} />;
}
