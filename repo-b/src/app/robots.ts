import type { MetadataRoute } from 'next';

const ORIGIN = process.env.NEXT_PUBLIC_MARKETING_ORIGIN ?? 'https://novendor.ai';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/app',
        '/login',
        '/admin',
        '/lab',
        '/api',
        '/bos',
        '/design-system',
        '/documents',
        '/fonts',
        '/novendor',
        '/floyorker',
        '/stone-pds',
        '/meridian',
        '/trading',
        '/ncf',
        '/tasks',
        '/upload',
        '/v1',
        '/onboarding',
        '/psychrag',
        '/paul',
        '/richard',
      ],
    },
    sitemap: `${ORIGIN}/sitemap.xml`,
  };
}
