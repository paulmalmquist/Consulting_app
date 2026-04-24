import Link from 'next/link';
import { ShiftHero } from '@/components/marketing/shift/ShiftHero';
import { ShiftMap } from '@/components/marketing/shift/ShiftMap';
import { RegimeTimeline } from '@/components/marketing/shift/RegimeTimeline';
import { WhatYouGainGrid } from '@/components/marketing/shift/WhatYouGainGrid';

export default function ShiftPage() {
  return (
    <div className="space-y-8 lg:space-y-10">
      <ShiftHero />
      <ShiftMap />
      <RegimeTimeline />
      <WhatYouGainGrid />
      <section className="rounded-3xl border border-nv-teal/25 bg-gradient-to-r from-nv-surface/80 to-nv-teal/6 p-6 sm:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-nv-teal">Next Step</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Inventory your current execution</h2>
            <p className="text-sm text-nv-muted sm:text-base">
              Baseline what should stay, what should automate, and where governance must hold.
            </p>
          </div>
          <Link
            href="/operational-assessment"
            className="inline-flex items-center justify-center rounded-[4px] border border-nv-teal/25 bg-nv-bg/70 px-6 py-3 text-sm font-semibold text-nv-teal transition hover:border-nv-teal/18 hover:bg-nv-teal/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-teal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg"
          >
            Start an assessment
          </Link>
        </div>
      </section>
    </div>
  );
}
