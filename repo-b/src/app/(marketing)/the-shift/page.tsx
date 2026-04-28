import { NvHero } from '@/components/marketing/home/NvHero';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { NvButton } from '@/components/marketing/ui/NvButton';

const shiftPanel = [
  { k: 'OLD', v: 'Software dependence' },
  { k: 'NEW', v: 'Execution ownership' },
  { k: 'UNIT', v: 'One workflow' },
  { k: 'TIMEFRAME', v: '12 weeks' },
  { k: 'PROOF', v: 'Traceable to rule + state' },
];

const manifestoPoints = [
  'Your core workflows should be governed by your team, not hidden in vendor logic.',
  'Automation without state control creates speed without accountability.',
  'Execution ownership means every output can be traced to a rule, a state, and an approver.',
];

export default function TheShiftPage() {
  return (
    <div className="nv-page">
      <NvHero
        eyebrow="Manifesto"
        headline={
          <>
            From software dependence to <em>execution ownership</em>.
          </>
        }
        lede="The next operating model is not 'more tools'. It is owning the states, rules, and outputs that run your business. Own Your Operating Logic."
        panel={shiftPanel}
        panelTitle="The shift, in one frame"
      />

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Manifesto</p>
        </div>
        <div className="grid gap-4">
          {manifestoPoints.map((point, idx) => (
            <NvCard key={idx}>
              <p className="nv-eyebrow" style={{ marginBottom: 10 }}>{String(idx + 1).padStart(2, '0')}</p>
              <p className="nv-body" style={{ margin: 0, fontSize: 17 }}>{point}</p>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow">Action</p>
        </div>
        <NvCard>
          <h2 className="nv-h3" style={{ marginBottom: 12 }}>Start with one workflow.</h2>
          <p className="nv-body" style={{ margin: 0 }}>Prove the model in 12 weeks.</p>
          <div className="flex flex-wrap gap-3" style={{ marginTop: 24 }}>
            <NvButton variant="primary" href="/operational-assessment">See your first use case</NvButton>
            <NvButton variant="secondary" href="/contact">Fix your workflow</NvButton>
          </div>
        </NvCard>
      </section>
    </div>
  );
}
