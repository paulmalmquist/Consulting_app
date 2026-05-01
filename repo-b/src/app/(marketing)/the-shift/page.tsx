import { NvHero } from '@/components/marketing/home/NvHero';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { NvButton } from '@/components/marketing/ui/NvButton';

const shiftPanel = [
  { k: 'OLD', v: 'Buy more AI software' },
  { k: 'NEW', v: 'Get your data and process AI-ready first' },
  { k: 'UNIT', v: 'One workflow at a time' },
  { k: 'WORKING ORDER', v: 'Data, then playbook, then AI' },
  { k: 'PROOF', v: 'AI output traceable to data and rule' },
];

const manifestoPoints = [
  'Most AI projects don\'t fail at the model. They fail at the data and the process underneath it.',
  'A workflow that doesn\'t run the same way twice can\'t be automated. Fix that first.',
  'AI is useful when the data it sees is real and the rules it follows are written down. Otherwise it\'s a demo.',
];

export default function TheShiftPage() {
  return (
    <div className="nv-page">
      <NvHero
        eyebrow="Manifesto"
        headline={
          <>
            Get your data, your playbook, and your process <em>AI-ready</em>.
          </>
        }
        lede="The next operating model isn't 'more AI tools.' It's getting your data, your written-down playbook, and your process to the point where the AI you adopt — yours or a vendor's — actually works on real inputs. Own Your Operating Logic."
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
          <p className="nv-body" style={{ margin: 0 }}>Prove the model on real data before scaling. The AI you adopt next earns its keep — or it doesn't, and you find out cheaply.</p>
          <div className="flex flex-wrap gap-3" style={{ marginTop: 24 }}>
            <NvButton variant="primary" href="/operational-assessment">Get an AI-readiness review</NvButton>
            <NvButton variant="secondary" href="/contact">See where AI is blocked in your workflow</NvButton>
          </div>
        </NvCard>
      </section>
    </div>
  );
}
