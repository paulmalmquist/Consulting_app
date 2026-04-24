'use client';

import { useMemo, useState } from 'react';
import kbObjects from '@content/kb_objects/index.json';
import { TagPills } from '../content/TagPills';

export type KBObject = {
  id: string;
  title: string;
  description: string;
  role: string;
  workflow: string;
  system: string;
  risk: string;
  tags: string[];
  content: string;
  citations: string[];
};

const objects = kbObjects as KBObject[];

export function KBExplorer() {
  const [filters, setFilters] = useState({ role: 'All', workflow: 'All', system: 'All', risk: 'All' });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(objects[0]?.id ?? '');

  const options = useMemo(() => {
    const unique = (key: keyof KBObject) => Array.from(new Set(objects.map((item) => item[key])));
    return {
      role: unique('role'),
      workflow: unique('workflow'),
      system: unique('system'),
      risk: unique('risk')
    };
  }, []);

  const filtered = useMemo(() => {
    return objects.filter((item) => {
      const matchesFilters =
        (filters.role === 'All' || item.role === filters.role) &&
        (filters.workflow === 'All' || item.workflow === filters.workflow) &&
        (filters.system === 'All' || item.system === filters.system) &&
        (filters.risk === 'All' || item.risk === filters.risk);
      const matchesSearch = [item.title, item.description, item.content]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase());
      return matchesFilters && matchesSearch;
    });
  }, [filters, search]);

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1fr_1.2fr]">
      <div className="space-y-4 rounded-2xl border border-nv-text/8 bg-nv-surface/60 p-4">
        <h3 className="text-sm font-semibold text-white">Filters</h3>
        {(['role', 'workflow', 'system', 'risk'] as const).map((key) => (
          <label key={key} className="block text-xs text-nv-dim">
            {key}
            <select
              value={filters[key]}
              onChange={(event) => setFilters((prev) => ({ ...prev, [key]: event.target.value }))}
              className="mt-2 w-full rounded-lg border border-nv-text/10 bg-nv-surface/60 px-3 py-2 text-sm text-white"
            >
              <option>All</option>
              {options[key].map((value) => {
                const text = Array.isArray(value) ? value.join(', ') : value;
                const optionKey = Array.isArray(value) ? value.join('|') : value;
                return (
                  <option key={optionKey} value={text}>
                    {text}
                  </option>
                );
              })}
            </select>
          </label>
        ))}
        <label className="block text-xs text-nv-dim">
          Search within KB
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="mt-2 w-full rounded-lg border border-nv-text/10 bg-nv-surface/60 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>
      <div className="space-y-3 rounded-2xl border border-nv-text/8 bg-nv-surface/60 p-4">
        <h3 className="text-sm font-semibold text-white">Objects</h3>
        <div className="space-y-2">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                selected?.id === item.id
                  ? 'border-nv-teal/18 bg-nv-teal/10 text-white'
                  : 'border-nv-text/8 bg-nv-bg/40 text-nv-muted hover:border-nv-text/20'
              }`}
            >
              <p className="font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-xs text-nv-dim">{item.description}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-4 rounded-2xl border border-nv-text/8 bg-nv-surface/60 p-4">
        {selected ? (
          <>
            <div>
              <h3 className="text-lg font-semibold text-white">{selected.title}</h3>
              <p className="text-sm text-nv-muted">{selected.description}</p>
            </div>
            <TagPills tags={selected.tags} />
            <p className="text-sm text-nv-text">{selected.content}</p>
            <div className="rounded-xl border border-nv-text/10 bg-nv-bg/40 p-3">
              <p className="text-xs font-semibold text-nv-text">Citations</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-nv-dim">
                {selected.citations.map((citation) => (
                  <li key={citation}>{citation}</li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p className="text-sm text-nv-dim">No objects match this filter.</p>
        )}
      </div>
    </div>
  );
}
