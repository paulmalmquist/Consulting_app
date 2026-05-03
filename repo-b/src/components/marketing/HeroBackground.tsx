import Image from 'next/image';
import type { ReactNode } from 'react';
import { cn } from './ui/cn';

type HeroFallbackTone = 'default' | 'concierge';

type HeroBackgroundProps = {
  imageSrc?: string;
  imageAlt?: string;
  className?: string;
  contentClassName?: string;
  /** Override overlay opacity. 0 = no dim, 1 = solid black. Default 0.55. */
  overlayOpacity?: number;
  /** Picks a page-specific abstract fallback when no imageSrc ships. */
  fallbackTone?: HeroFallbackTone;
  children: ReactNode;
};

/**
 * Full-bleed hero wrapper. Image (if provided) is rendered with next/image
 * fill mode and dimmed by a configurable overlay so headline text stays
 * readable. Falls back to an on-brand abstract panel when imageSrc is absent;
 * `fallbackTone` selects a page-specific composition (e.g. an operating-console
 * grid for AI Concierge) so the fallback can carry the page's read instead of
 * being a generic placeholder.
 */
export function HeroBackground({
  imageSrc,
  imageAlt = '',
  className,
  contentClassName,
  overlayOpacity = 0.65,
  fallbackTone = 'default',
  children,
}: HeroBackgroundProps) {
  return (
    <section className={cn('nv-hero-bg', className)}>
      {imageSrc ? (
        <>
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            priority
            sizes="100vw"
            className="nv-hero-bg__img"
          />
          <div
            className="nv-hero-bg__overlay"
            style={{ background: `rgba(0,0,0,${overlayOpacity})` }}
            aria-hidden="true"
          />
        </>
      ) : (
        <div
          className={cn(
            'nv-hero-bg__fallback',
            fallbackTone === 'concierge' && 'nv-hero-bg__fallback--concierge'
          )}
          aria-hidden="true"
        >
          {fallbackTone === 'concierge' ? <ConciergeFallbackArt /> : null}
        </div>
      )}
      <div className={cn('nv-hero-bg__content', contentClassName)}>{children}</div>
    </section>
  );
}

/**
 * Operating-console fallback: faint grid panels, two data-trail lines that
 * run left to right and end at a "reviewed" checkpoint node. Renders inside
 * the fallback layer so the existing hero copy stays readable above it.
 */
function ConciergeFallbackArt() {
  return (
    <svg
      className="nv-hero-bg__concierge-art"
      viewBox="0 0 1600 720"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="nvHeroTrailA" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(92,213,204)" stopOpacity="0" />
          <stop offset="55%" stopColor="rgb(92,213,204)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="rgb(92,213,204)" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="nvHeroTrailB" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(198,132,255)" stopOpacity="0" />
          <stop offset="60%" stopColor="rgb(198,132,255)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="rgb(198,132,255)" stopOpacity="0.75" />
        </linearGradient>
        <pattern id="nvHeroGrid" width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M80 0H0V80" fill="none" stroke="rgba(232,236,242,0.05)" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="1600" height="720" fill="url(#nvHeroGrid)" />

      {/* Faint vertical panel divisions */}
      <g stroke="rgba(232,236,242,0.06)" strokeWidth="1">
        <line x1="320" y1="0" x2="320" y2="720" />
        <line x1="800" y1="0" x2="800" y2="720" />
        <line x1="1200" y1="0" x2="1200" y2="720" />
      </g>

      {/* Stepped audit-trail lines that end at the review node */}
      <path
        d="M120 380 H540 V300 H940 V360 H1240"
        fill="none"
        stroke="url(#nvHeroTrailA)"
        strokeWidth="1.4"
      />
      <path
        d="M120 460 H440 V520 H860 V440 H1240"
        fill="none"
        stroke="url(#nvHeroTrailB)"
        strokeWidth="1.2"
      />

      {/* Approval checkpoints along the trail */}
      <g fill="rgb(3,7,14)" stroke="rgba(92,213,204,0.55)" strokeWidth="1.2">
        <rect x="534" y="294" width="12" height="12" />
        <rect x="934" y="354" width="12" height="12" />
        <rect x="434" y="514" width="12" height="12" />
        <rect x="854" y="434" width="12" height="12" />
      </g>

      {/* Review node — the only "human" signal, rendered as a checked badge */}
      <g transform="translate(1240,360)">
        <circle r="34" fill="rgb(8,13,23)" stroke="rgba(92,213,204,0.8)" strokeWidth="1.4" />
        <circle r="34" fill="none" stroke="rgba(92,213,204,0.18)" strokeWidth="14" />
        <path
          d="M-12 2 L-3 12 L14 -10"
          fill="none"
          stroke="rgb(92,213,204)"
          strokeWidth="2.4"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </g>
      <text
        x="1240"
        y="420"
        textAnchor="middle"
        fontFamily="var(--font-marketing-mono), ui-monospace, monospace"
        fontSize="11"
        letterSpacing="2"
        fill="rgba(186,201,219,0.7)"
      >
        REVIEWED
      </text>
    </svg>
  );
}
