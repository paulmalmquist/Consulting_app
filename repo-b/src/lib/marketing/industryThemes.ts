import type { IndustryVertical } from '@content/industry-verticals';

type IndustryThemeKey = IndustryVertical['themeKey'];

type IndustryThemeStyles = {
  eyebrowText: string;
  accentText: string;
  accentBorder: string;
  accentSurface: string;
  primaryCta: string;
  quickSwitchActive: string;
  quickSwitchInactive: string;
  impactSection: string;
  impactCard: string;
};

/**
 * Hero background imagery per industry. Drop a JPEG/WEBP at each path
 * into repo-b/public/assets/ to enable. When a file is missing,
 * <HeroBackground> falls back to an on-brand gradient automatically.
 *
 * Suggested subjects:
 *  - bg-repe.jpg        skyline / commercial real estate
 *  - bg-consumer.jpg    abstract finance / cards / charts
 *  - bg-medical.jpg     clinical operations / hospital systems
 *  - bg-legal.jpg       documents / matter intake / orderly office
 */
export const industryBackgrounds: Record<IndustryVertical['slug'], string> = {
  'real-estate-private-equity': '/assets/bg-repe.jpg',
  'consumer-credit': '/assets/bg-consumer.jpg',
  medical: '/assets/bg-medical.jpg',
  legal: '/assets/bg-legal.jpg',
  trades: '/assets/bg-trades.jpg',
};

/** Homepage hero background. Same fallback rules apply. */
export const HOMEPAGE_BACKGROUND = '/assets/bg-home.jpg';

export const INDUSTRY_THEME_STYLES = {
  cyan: {
    eyebrowText: 'text-nv-teal',
    accentText: 'text-nv-teal',
    accentBorder: 'border-cyan-300/25',
    accentSurface: 'bg-cyan-200/10',
    primaryCta:
      'inline-flex items-center justify-center rounded-full border border-cyan-300/45 bg-cyan-200/10 px-5 py-2.5 text-sm font-semibold text-nv-text transition hover:border-cyan-200/70 hover:bg-cyan-200/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg',
    quickSwitchActive: 'border-cyan-300/45 bg-cyan-200/10 text-nv-text',
    quickSwitchInactive:
      'border-nv-text/10 bg-nv-bg/45 text-nv-muted hover:border-cyan-300/35 hover:bg-nv-teal/10 hover:text-nv-text',
    impactSection: 'border-cyan-300/25 bg-gradient-to-r from-nv-surface/85 to-nv-teal/15',
    impactCard: 'border-cyan-300/20 bg-nv-bg/55'
  },
  amber: {
    eyebrowText: 'text-nv-warning',
    accentText: 'text-nv-warning',
    accentBorder: 'border-amber-300/25',
    accentSurface: 'bg-amber-200/10',
    primaryCta:
      'inline-flex items-center justify-center rounded-full border border-amber-300/45 bg-amber-200/10 px-5 py-2.5 text-sm font-semibold text-nv-text transition hover:border-amber-200/70 hover:bg-amber-200/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg',
    quickSwitchActive: 'border-amber-300/45 bg-amber-200/10 text-nv-text',
    quickSwitchInactive:
      'border-nv-text/10 bg-nv-bg/45 text-nv-muted hover:border-amber-300/35 hover:bg-nv-copper/10 hover:text-nv-text',
    impactSection: 'border-amber-300/25 bg-gradient-to-r from-nv-surface/85 to-nv-copper/15',
    impactCard: 'border-amber-300/20 bg-nv-bg/55'
  },
  rose: {
    eyebrowText: 'text-nv-risk',
    accentText: 'text-nv-risk',
    accentBorder: 'border-rose-300/25',
    accentSurface: 'bg-rose-200/10',
    primaryCta:
      'inline-flex items-center justify-center rounded-full border border-rose-300/45 bg-rose-200/10 px-5 py-2.5 text-sm font-semibold text-nv-text transition hover:border-rose-200/70 hover:bg-rose-200/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg',
    quickSwitchActive: 'border-rose-300/45 bg-rose-200/10 text-nv-text',
    quickSwitchInactive:
      'border-nv-text/10 bg-nv-bg/45 text-nv-muted hover:border-rose-300/35 hover:bg-nv-copper/10 hover:text-nv-text',
    impactSection: 'border-rose-300/25 bg-gradient-to-r from-nv-surface/85 to-nv-copper/15',
    impactCard: 'border-rose-300/20 bg-nv-bg/55'
  },
  violet: {
    eyebrowText: 'text-nv-copper',
    accentText: 'text-nv-copper',
    accentBorder: 'border-violet-300/25',
    accentSurface: 'bg-violet-200/10',
    primaryCta:
      'inline-flex items-center justify-center rounded-full border border-violet-300/45 bg-violet-200/10 px-5 py-2.5 text-sm font-semibold text-nv-text transition hover:border-violet-200/70 hover:bg-violet-200/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg',
    quickSwitchActive: 'border-violet-300/45 bg-violet-200/10 text-nv-text',
    quickSwitchInactive:
      'border-nv-text/10 bg-nv-bg/45 text-nv-muted hover:border-violet-300/35 hover:bg-nv-copper/10 hover:text-nv-text',
    impactSection: 'border-violet-300/25 bg-gradient-to-r from-nv-surface/85 to-nv-copper/15',
    impactCard: 'border-violet-300/20 bg-nv-bg/55'
  }
} as const satisfies Record<IndustryThemeKey, IndustryThemeStyles>;
