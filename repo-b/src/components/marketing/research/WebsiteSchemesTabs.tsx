'use client';

import { useMemo, useRef, useState } from 'react';
import type { ResearchEntry } from '@/lib/marketing/content';
import { cn } from '../ui/cn';

type SchemeItem = {
  id: string;
  name: string;
  whenToUse: string;
  narrativeArc: string[];
  hero: {
    headline: string;
    subhead: string;
  };
  ctaExample: string;
  risk: string;
  mitigation: string;
};

type SchemesSection = {
  type: 'schemes';
  title: string;
  items: SchemeItem[];
};

type WebsiteSchemesTabsProps = {
  entry: ResearchEntry;
};

export function WebsiteSchemesTabs({ entry }: WebsiteSchemesTabsProps) {
  const schemesSection = entry.sections.find((section) => section.type === 'schemes') as SchemesSection | undefined;
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const items = schemesSection?.items ?? [];
  const activeScheme = items[activeIndex];

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!items.length) {
      return;
    }

    let nextIndex = index;

    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % items.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    setActiveIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  };

  const panelId = useMemo(() => (activeScheme ? `${activeScheme.id}-panel` : 'scheme-panel'), [activeScheme]);

  if (!schemesSection || items.length === 0) {
    return null;
  }

  return (
    <section id="schemes" className="space-y-4 rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-5 sm:p-6">
      <h2 className="text-2xl font-semibold tracking-tight text-white">{schemesSection.title}</h2>

      <div role="tablist" aria-label="Website narrative schemes" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, index) => {
          const isActive = activeIndex === index;
          const tabId = `${item.id}-tab`;

          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={tabId}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={cn(
                'rounded-xl border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-teal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg',
                isActive
                  ? 'border-nv-teal/25 bg-nv-teal/8 text-nv-teal'
                  : 'border-nv-text/16 bg-nv-bg/80 text-nv-muted hover:border-nv-teal/25'
              )}
            >
              {item.name}
            </button>
          );
        })}
      </div>

      {activeScheme && (
        <article
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${activeScheme.id}-tab`}
          className="space-y-4 rounded-2xl border border-nv-text/10 bg-nv-bg/80 p-4 sm:p-5"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-nv-teal">When to use</p>
            <p className="mt-1 text-sm text-nv-muted">{activeScheme.whenToUse}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-nv-teal">Narrative arc</p>
            <ul className="mt-1 space-y-1 text-sm text-nv-muted">
              {activeScheme.narrativeArc.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-nv-text/10 bg-nv-surface/55 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-nv-teal">Hero example</p>
              <p className="mt-2 text-sm font-semibold text-white">{activeScheme.hero.headline}</p>
              <p className="mt-1 text-sm text-nv-muted">{activeScheme.hero.subhead}</p>
            </div>
            <div className="rounded-xl border border-nv-text/10 bg-nv-surface/55 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-nv-teal">CTA example</p>
              <p className="mt-2 text-sm font-semibold text-white">{activeScheme.ctaExample}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-amber-300/25 bg-amber-200/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-100">Risk</p>
              <p className="mt-1 text-sm text-amber-50">{activeScheme.risk}</p>
            </div>
            <div className="rounded-xl border border-nv-teal/25 bg-nv-teal/8 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-nv-teal">Mitigation</p>
              <p className="mt-1 text-sm text-nv-teal">{activeScheme.mitigation}</p>
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
