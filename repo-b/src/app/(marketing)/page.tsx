import { BeforeAfterDiagram } from '@/components/marketing/visual/BeforeAfterDiagram';
import { ControlLayerDiagram } from '@/components/marketing/visual/ControlLayerDiagram';
import { NvHero } from '@/components/marketing/home/NvHero';
import { NvCard } from '@/components/marketing/ui/NvCard';

const steps = [
  { name: 'Discovery', detail: 'Map one high-friction workflow and baseline cycle time, error rate, and owner gaps.' },
  { name: 'Pilot', detail: 'Build controlled states, rules, and evidence in parallel with current operations.' },
  { name: 'Cutover', detail: 'Switch with rollback protection once outputs match and governance is approved.' },
];

const heroPanel = [
  { k: 'STATUS', v: 'Accepting Q3 cohort' },
  { k: 'SCOPE', v: 'One workflow · eight weeks' },
  { k: 'MODEL', v: 'Discovery · Pilot · Cutover' },
  { k: 'EVIDENCE', v: 'Cycle · errors · owners' },
  { k: 'OUTCOME', v: '25–40% manual reduction' },
];

export default function HomePage() {
  return (
    <div className="nv-page">
      <NvHero
        eyebrow="Own your operating logic"
        headline={
          <>
            Put <em>AI</em> to work.
          </>
        }
        lede="Own and control your AI strategy. We help you replace fragmented workflows with controlled execution systems your team operates."
        primaryCta={{ label: 'Identify your first fixable workflow in 30 minutes', href: '/operational-assessment' }}
        secondaryCta={{ label: 'Start with one workflow', href: '/what-we-do' }}
        panel={heroPanel}
        panelTitle="Engagement model"
      />

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow">3-step model</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <NvCard key={step.name}>
              <p className="nv-eyebrow" style={{ marginBottom: 12 }}>Step {index + 1}</p>
              <h3 className="nv-h3" style={{ marginBottom: 8 }}>{step.name}</h3>
              <p className="nv-body" style={{ margin: 0 }}>{step.detail}</p>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <BeforeAfterDiagram title="Own Your Operating Logic: Workflow Transformation" />
      </section>

      <section className="nv-section">
        <ControlLayerDiagram title="Controlled Execution Layer" />
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow">Case example · illustrative</p>
        </div>
        <NvCard>
          <h2 className="nv-h2" style={{ marginBottom: 16, fontSize: 32 }}>
            From reporting drift to controlled fund operations
          </h2>
          <p className="nv-body">
            A synthetic REPE scenario: a mid-market operator replaced spreadsheet-driven capital call handoffs
            with state-based approvals and reduced capital call errors from 5% to 1.2% in 8 weeks.
          </p>
        </NvCard>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Typical results</p>
        </div>
        <NvCard>
          <ul className="nv-body" style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
            <li>25–40% reduction in manual reconciliation</li>
            <li>30% faster reporting cycles</li>
            <li>90%+ traceability on key workflows</li>
          </ul>
          <p className="nv-body" style={{ marginTop: 16 }}>
            Own Your Operating Logic is the operating thesis behind every implementation.
          </p>
        </NvCard>
      </section>
    </div>
  );
}
