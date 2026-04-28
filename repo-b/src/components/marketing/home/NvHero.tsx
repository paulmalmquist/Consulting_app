import type { ReactNode } from 'react';
import { NvButton } from '../ui/NvButton';

export type NvHeroPanelLine = {
  k: string;
  v: ReactNode;
};

type NvHeroProps = {
  eyebrow: string;
  headline: ReactNode;
  lede?: ReactNode;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  panel?: NvHeroPanelLine[];
  panelTitle?: string;
};

export function NvHero({
  eyebrow,
  headline,
  lede,
  primaryCta,
  secondaryCta,
  panel,
  panelTitle,
}: NvHeroProps) {
  return (
    <section className="nv-hero">
      <div>
        <p className="nv-eyebrow">
          <span className="nv-eyebrow-dot" />
          {eyebrow}
        </p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24 }}>
          {headline}
        </h1>
        {lede ? <p className="nv-lede">{lede}</p> : null}
        {(primaryCta || secondaryCta) && (
          <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 28 }}>
            {primaryCta && (
              <NvButton variant="primary" href={primaryCta.href}>
                {primaryCta.label}
              </NvButton>
            )}
            {secondaryCta && (
              <NvButton variant="secondary" href={secondaryCta.href}>
                {secondaryCta.label}
              </NvButton>
            )}
          </div>
        )}
      </div>
      {panel && panel.length > 0 && (
        <aside className="nv-hero-panel">
          {panelTitle && (
            <p className="nv-eyebrow" style={{ marginBottom: 14 }}>
              {panelTitle}
            </p>
          )}
          {panel.map((row) => (
            <div key={row.k} className="line">
              <span className="k">{row.k}</span>
              <span className="v">{row.v}</span>
            </div>
          ))}
        </aside>
      )}
    </section>
  );
}
