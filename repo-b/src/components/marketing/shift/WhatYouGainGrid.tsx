import { BadgeDollarSign, Clock3, FileCheck2, GitCompareArrows, ShieldCheck, UserCheck2 } from 'lucide-react';

const gains = [
  { label: 'Lower long-term cost', icon: BadgeDollarSign },
  { label: 'Faster change without migrations', icon: GitCompareArrows },
  { label: 'Clear ownership of logic and data', icon: ShieldCheck },
  { label: 'Continuity across teams/time', icon: Clock3 },
  { label: 'Traceable, replayable runs', icon: FileCheck2 },
  { label: 'Humans approve exceptions', icon: UserCheck2 }
];

export function WhatYouGainGrid() {
  return (
    <section aria-labelledby="what-you-gain-title" className="space-y-5 rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-4 sm:p-6 lg:p-8">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-nv-teal">What You Gain</p>
        <h2 id="what-you-gain-title" className="text-2xl font-semibold tracking-tight text-nv-text md:text-3xl">
          Practical outcomes from the new operating model.
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {gains.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-2xl border border-nv-text/8 bg-nv-bg/80 px-4 py-4 text-sm text-nv-text transition hover:border-nv-teal/25"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-nv-teal/25 bg-nv-teal/8 text-nv-teal">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <p className="leading-snug">{item.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
