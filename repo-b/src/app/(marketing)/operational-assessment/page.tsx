import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { PageHeader } from '@/components/marketing/ui/PageHeader';
import { OperationalQuestionnaire } from '@/components/marketing/assessment/OperationalQuestionnaire';

const steps = [
  { title: 'Inventory', detail: 'Map tools, owners, and handoffs for one workflow.' },
  { title: 'Measure', detail: 'Baseline delays, rework rates, and exception volume.' },
  { title: 'Redesign', detail: 'Define states, rules, and evidence requirements.' },
  { title: 'Certify', detail: 'Validate outputs, governance, and rollback readiness.' }
];

export default function OperationalAssessmentPage() {
  return (
    <div className="nv-page">
      <PageHeader
        eyebrow="AI-Readiness Review"
        headline="Identify your highest-friction workflow in four steps."
        lede="Score your breakdown points before investing in a full rebuild. One workflow, real data, eight weeks."
      />

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />The four steps</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {steps.map((step, index) => (
            <NvCard key={step.title}>
              <p className="nv-eyebrow" style={{ marginBottom: 8 }}>Step {index + 1}</p>
              <h2 className="nv-h3">{step.title}</h2>
              <p className="nv-body" style={{ margin: 0 }}>{step.detail}</p>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Sample output</p>
        </div>
        <NvCard>
          <p className="nv-body" style={{ margin: 0 }}>
            Workflow: Capital call approvals · Friction score: 78/100 (High) · Primary break: owner handoff between fund accounting and investor relations · First fix: state-based approval queue with rule-linked evidence.
          </p>
        </NvCard>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Assessment (returns a score)</p>
        </div>
        <OperationalQuestionnaire variant="public" />
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />What changes</p>
        </div>
        <NvCard>
          <ul className="nv-body" style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
            <li>Top workflow prioritized in under one week</li>
            <li>25–40% reduction in manual interventions after redesign</li>
            <li>90%+ traceability once control points are certified</li>
          </ul>
          <div className="flex flex-wrap gap-3" style={{ marginTop: 24 }}>
            <NvButton variant="primary" href="/contact">See your first use case</NvButton>
          </div>
        </NvCard>
      </section>
    </div>
  );
}
