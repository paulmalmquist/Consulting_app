import { HeroBackground } from '@/components/marketing/HeroBackground';
import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { OperationalQuestionnaire } from '@/components/marketing/assessment/OperationalQuestionnaire';
import { fileExistsInPublic } from '@/lib/marketing/publicAssets';

const HERO_BG = '/assets/bg-operational-assessment.jpg';

const steps = [
  { title: 'Inventory', detail: 'Map tools, owners, and handoffs for one workflow.' },
  { title: 'Measure', detail: 'Baseline delays, rework rates, and exception volume.' },
  { title: 'Redesign', detail: 'Define states, rules, and evidence requirements.' },
  { title: 'Certify', detail: 'Validate outputs, governance, and rollback readiness.' }
];

export default function OperationalAssessmentPage() {
  const bgSrc = fileExistsInPublic(HERO_BG) ? HERO_BG : undefined;

  return (
    <>
      <HeroBackground imageSrc={bgSrc} imageAlt="" overlayOpacity={0.45}>
        <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Operational Assessment</p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24 }}>
          Identify your <em>friction</em>.
        </h1>
        <p className="nv-lede">
          We review how work moves through your business, where handoffs slow down, where data breaks, and where approvals lose clarity. The result is a practical map of what needs to be fixed before AI or automation can help.
        </p>
        <div style={{ marginTop: 28 }}>
          <NvButton variant="primary" href="/contact">Start an assessment</NvButton>
        </div>
      </HeroBackground>

      <div className="nv-page" style={{ paddingTop: 0 }}>
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
            <div style={{ marginTop: 24 }}>
              <NvButton variant="primary" href="/contact">Start an assessment</NvButton>
            </div>
          </NvCard>
        </section>
      </div>
    </>
  );
}
