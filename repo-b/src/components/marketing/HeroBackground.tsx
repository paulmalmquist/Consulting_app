import Image from 'next/image';
import type { ReactNode } from 'react';
import { cn } from './ui/cn';

type HeroBackgroundProps = {
  imageSrc?: string;
  imageAlt?: string;
  className?: string;
  contentClassName?: string;
  /** Override overlay opacity. 0 = no dim, 1 = solid black. Default 0.55. */
  overlayOpacity?: number;
  children: ReactNode;
};

/**
 * Full-bleed hero wrapper. Image (if provided) is rendered with next/image
 * fill mode and dimmed by a configurable overlay so headline text stays
 * readable. Falls back to an on-brand gradient when imageSrc is absent —
 * ship the layout now, drop the JPEGs into /public/assets/ later.
 */
export function HeroBackground({
  imageSrc,
  imageAlt = '',
  className,
  contentClassName,
  overlayOpacity = 0.55,
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
        <div className="nv-hero-bg__fallback" aria-hidden="true" />
      )}
      <div className={cn('nv-hero-bg__content', contentClassName)}>{children}</div>
    </section>
  );
}
