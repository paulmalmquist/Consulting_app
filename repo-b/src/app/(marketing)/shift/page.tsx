import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { ShiftHero } from '@/components/marketing/shift/ShiftHero';
import { ShiftMap } from '@/components/marketing/shift/ShiftMap';
import { RegimeTimeline } from '@/components/marketing/shift/RegimeTimeline';
import { WhatYouGainGrid } from '@/components/marketing/shift/WhatYouGainGrid';

export default function ShiftPage() {
  return (
    <div className="nv-page">
      <ShiftHero />

      <section className="nv-section">
        <ShiftMap />
      </section>

      <section className="nv-section">
        <RegimeTimeline />
      </section>

      <section className="nv-section">
        <WhatYouGainGrid />
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Next step</p>
        </div>
        <NvCard>
          <h2 className="nv-h3">Inventory your current execution.</h2>
          <p className="nv-body">Baseline what should stay, what should automate, and where governance must hold.</p>
          <div style={{ marginTop: 24 }}>
            <NvButton variant="primary" href="/operational-assessment">Start an assessment</NvButton>
          </div>
        </NvCard>
      </section>
    </div>
  );
}
