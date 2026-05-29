import type { MetadataRoute } from 'next';
import { getAllDocs, getAllInsights, getAllResearchEntries } from '@/lib/marketing/content';

const ORIGIN = process.env.NEXT_PUBLIC_MARKETING_ORIGIN ?? 'https://novendor.ai';

const STATIC_ROUTES = [
  '/',
  '/about',
  '/capabilities',
  '/contact',
  '/demo',
  '/legal',
  '/method',
  '/services',
  '/what-we-do',
  '/proof',
  '/ai-roi',
  '/ai-roi/assessment',
  '/ai-roi/calculator',
  '/ai-roi/case-studies',
  '/ai-roi/resources',
  '/ai-concierge',
  '/cfo',
  '/operational-assessment',
  '/support-ops',
  '/saas-iceberg',
  '/docs',
  '/industries',
  '/insights',
  '/research',
];

const INDUSTRY_SLUGS = [
  'real-estate-private-equity',
  'consumer-credit',
  'medical',
  'legal',
];

function url(path: string): MetadataRoute.Sitemap[number] {
  return {
    url: `${ORIGIN}${path}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.7,
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = STATIC_ROUTES.map(url);

  const industryEntries = INDUSTRY_SLUGS.map((slug) => url(`/industries/${slug}`));

  let docEntries: MetadataRoute.Sitemap = [];
  try {
    docEntries = getAllDocs().map((doc) => url(`/docs/${doc.slug}`));
  } catch {
    // Content directory may not be present in all build environments
  }

  let insightEntries: MetadataRoute.Sitemap = [];
  try {
    insightEntries = getAllInsights().map((insight) => url(`/insights/${insight.slug}`));
  } catch {
    // Content directory may not be present in all build environments
  }

  let researchEntries: MetadataRoute.Sitemap = [];
  try {
    researchEntries = getAllResearchEntries().map((entry) => url(`/research/${entry.slug}`));
  } catch {
    // Content directory may not be present in all build environments
  }

  return [
    ...staticEntries,
    ...industryEntries,
    ...docEntries,
    ...insightEntries,
    ...researchEntries,
  ];
}
