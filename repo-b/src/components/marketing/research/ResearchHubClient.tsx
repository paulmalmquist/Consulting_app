'use client';

import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ResearchAudience, ResearchEntry, ResearchMaturity, ResearchTag } from '@/lib/marketing/content';
import { cn } from '../ui/cn';

type ResearchCardEntry = Pick<
  ResearchEntry,
  'id' | 'title' | 'slug' | 'summary' | 'tags' | 'audience' | 'maturity'
>;

type ResearchHubClientProps = {
  entries: ResearchCardEntry[];
};

const AUDIENCE_ORDER: ResearchAudience[] = ['CEO', 'COO', 'CIO/IT', 'Ops', 'Finance'];
const MATURITY_ORDER: ResearchMaturity[] = ['Start', 'Refine', 'Prove'];

function parseCsvParam(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ResearchHubClient({ entries }: ResearchHubClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedTags = parseCsvParam(searchParams.get('tags')) as ResearchTag[];
  const selectedAudience = (searchParams.get('audience') ?? '') as ResearchAudience | '';
  const selectedMaturity = (searchParams.get('maturity') ?? '') as ResearchMaturity | '';
  const query = searchParams.get('q') ?? '';

  const allTags = useMemo(() => {
    const tags = new Set<ResearchTag>();
    entries.forEach((entry) => {
      entry.tags.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();

    return entries.filter((entry) => {
      const matchesTags = selectedTags.length === 0 || selectedTags.every((tag) => entry.tags.includes(tag));
      const matchesAudience = !selectedAudience || entry.audience.includes(selectedAudience);
      const matchesMaturity = !selectedMaturity || entry.maturity === selectedMaturity;
      const searchable = `${entry.title} ${entry.summary} ${entry.tags.join(' ')} ${entry.audience.join(' ')}`.toLowerCase();
      const matchesQuery = !lowerQuery || searchable.includes(lowerQuery);

      return matchesTags && matchesAudience && matchesMaturity && matchesQuery;
    });
  }, [entries, query, selectedAudience, selectedMaturity, selectedTags]);

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const toggleTag = (tag: ResearchTag) => {
    const exists = selectedTags.includes(tag);
    const nextTags = exists ? selectedTags.filter((current) => current !== tag) : [...selectedTags, tag];
    updateParams({ tags: nextTags.length ? nextTags.join(',') : null });
  };

  const clearFilters = () => {
    updateParams({ q: null, tags: null, audience: null, maturity: null });
  };

  return (
    <section className="space-y-6" aria-labelledby="research-library-title">
      <div className="space-y-4 rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-4 sm:p-6">
        <h2 id="research-library-title" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
          Research Library
        </h2>

        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-nv-dim" htmlFor="research-search">
            Search
          </label>
          <div className="flex items-center gap-3 rounded-xl border border-nv-text/10 bg-nv-bg/80 px-3 py-2">
            <Search size={16} className="text-nv-dim" aria-hidden="true" />
            <input
              id="research-search"
              value={query}
              onChange={(event) => updateParams({ q: event.target.value || null })}
              placeholder="Search frameworks, proof, and messaging"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-nv-faint"
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-nv-dim">Tags</p>
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-teal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg',
                    active
                      ? 'border-nv-teal/25 bg-nv-teal/8 text-nv-teal'
                      : 'border-nv-text/16 bg-nv-bg/80 text-nv-muted hover:border-nv-teal/25'
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-nv-dim">
            Audience
            <select
              value={selectedAudience}
              onChange={(event) => updateParams({ audience: event.target.value || null })}
              className="w-full rounded-xl border border-nv-text/12 bg-nv-bg/80 px-3 py-2 text-sm font-normal text-nv-text"
            >
              <option value="">All audiences</option>
              {AUDIENCE_ORDER.map((audience) => (
                <option key={audience} value={audience}>
                  {audience}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-nv-dim">
            Maturity
            <select
              value={selectedMaturity}
              onChange={(event) => updateParams({ maturity: event.target.value || null })}
              className="w-full rounded-xl border border-nv-text/12 bg-nv-bg/80 px-3 py-2 text-sm font-normal text-nv-text"
            >
              <option value="">All stages</option>
              {MATURITY_ORDER.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-nv-dim">{filteredEntries.length} result{filteredEntries.length === 1 ? '' : 's'}</p>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-full border border-nv-text/16 px-3 py-1 text-xs text-nv-muted transition hover:border-nv-text/20"
          >
            <X size={13} aria-hidden="true" />
            Clear filters
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filteredEntries.map((entry) => (
          <article key={entry.id} className="rounded-2xl border border-nv-text/10 bg-nv-surface/60 p-5">
            <h3 className="text-lg font-semibold text-white">{entry.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-nv-muted">{entry.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {entry.tags.slice(0, 3).map((tag) => (
                <span key={`${entry.id}-${tag}`} className="rounded-full border border-nv-text/12 px-2 py-1 text-[11px] text-nv-muted">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-nv-dim">
                {entry.audience[0]} | {entry.maturity}
              </p>
              <Link
                href={`/research/${entry.slug}`}
                className="inline-flex items-center rounded-[4px] border border-nv-teal/25 bg-nv-bg/70 px-3 py-1.5 text-xs font-semibold text-nv-teal transition hover:border-nv-teal/18"
              >
                Read
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
