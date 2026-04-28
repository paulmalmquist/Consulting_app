import { NvHero } from '@/components/marketing/home/NvHero';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { NvButton } from '@/components/marketing/ui/NvButton';

const aboutPanel = [
  { k: 'FOUNDED', v: '2024' },
  { k: 'BASE', v: 'NYC · remote' },
  { k: 'FOCUS', v: 'Operating layer for finance' },
  { k: 'ENGAGEMENT', v: 'Pilot · Cutover · Own' },
];

export default function AboutPage() {
  return (
    <div className="nv-page">
      <NvHero
        eyebrow="About Novendor"
        headline={
          <>
            We built Novendor after watching critical operations run on
            <em> disconnected </em>
            tools.
          </>
        }
        lede="Teams were forced to manage real risk across spreadsheets, SaaS apps, and manual handoffs. We built Novendor to replace that fragmentation with controlled execution systems companies actually own."
        panel={aboutPanel}
        panelTitle="Firm at a glance"
      />

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />The Shift</p>
        </div>
        <h2 className="nv-h2" style={{ marginBottom: 32 }}>
          Vendor dependence <em>→</em> execution ownership
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <NvCard>
            <p className="nv-eyebrow nv-pill nv-pill-risk" style={{ marginBottom: 14 }}>Vendor dependence</p>
            <p className="nv-body" style={{ margin: 0 }}>
              Disconnected tools, opaque logic, costly change cycles.
            </p>
          </NvCard>
          <NvCard>
            <p className="nv-eyebrow nv-pill nv-pill-teal" style={{ marginBottom: 14 }}>Execution ownership</p>
            <p className="nv-body" style={{ margin: 0 }}>
              Governed states, explicit rules, auditable outputs.
            </p>
          </NvCard>
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow">Typical results</p>
        </div>
        <NvCard>
          <ul className="nv-body" style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
            <li>20–35% faster cycle times on redesigned workflows</li>
            <li>25–40% lower manual rework across handoffs</li>
            <li>90%+ traceability for control-critical decisions</li>
          </ul>
          <div className="flex flex-wrap gap-3" style={{ marginTop: 24 }}>
            <NvButton variant="secondary" href="/the-shift">Read The Shift manifesto</NvButton>
            <NvButton variant="primary" href="/contact">Start with one workflow</NvButton>
          </div>
        </NvCard>
      </section>
    </div>
  );
}
