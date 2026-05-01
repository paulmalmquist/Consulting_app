import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { PageHeader } from '@/components/marketing/ui/PageHeader';
import { CredibilitySection } from '@/components/marketing/marketing/CredibilitySection';
import { CategoryMessagingFramework } from '@/components/marketing/marketing/CategoryMessagingFramework';

const VALUE_FOCUS = ['Lower SaaS spend', 'Faster execution', 'Stronger data ownership', 'Operational leverage at scale'];

const ASSESSMENT_EVALUATION = [
  'Redundant tools',
  'Manual processes',
  'Cost leakage',
  'Data fragmentation',
  'Automation opportunities'
];

const ASSESSMENT_ROADMAP = ['Cost reduction', 'Efficiency gains', 'AI deployment opportunities'];

const WORKFLOW_TARGETS = ['Operations', 'Credit', 'Underwriting', 'Reporting', 'Intake', 'Analysis'];

const MODEL_PHASES = [
  { title: 'Phase 1 — Assessment', description: 'Understand where the largest gains exist.' },
  { title: 'Phase 2 — Design', description: 'Create system architecture tailored to your workflows.' },
  { title: 'Phase 3 — Deployment', description: 'Implement high-impact automations.' },
  { title: 'Phase 4 — Scale', description: 'Expand internal infrastructure across teams.' }
];

const ICP = [
  'Spend heavily on SaaS',
  'Operate complex workflows',
  'Want more control over their systems',
  'Need faster execution',
  'Are scaling operations'
];

export default function ServicesPage() {
  return (
    <div className="nv-page">
      <PageHeader
        eyebrow="Services"
        headline={<>Operational infrastructure, <em>rebuilt</em> for the AI era.</>}
        lede="We help companies reduce software spend, automate workflows, and build internal AI systems that improve speed, control, and margins."
      >
        <div style={{ marginTop: 24 }}>
          <NvButton variant="primary" href="/contact">Book an executive assessment</NvButton>
        </div>
      </PageHeader>

      <section className="nv-section">
        <CredibilitySection />
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Replace software dependence with internal capability</p>
        </div>
        <NvCard>
          <p className="nv-body">
            Most organizations rely on 20–60 tools to operate. We identify where software is creating cost, friction, and operational drag, then design AI-native systems that bring those capabilities in-house.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" style={{ marginTop: 20 }}>
            {VALUE_FOCUS.map((item) => (
              <div key={item} className="nv-pill nv-pill-teal">{item}</div>
            ))}
          </div>
        </NvCard>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Core services</p>
        </div>
        <div className="grid gap-4">
          <NvCard>
            <h3 className="nv-h3">Executive Operational Assessment</h3>
            <p className="nv-body">A deep analysis of your workflows, software stack, and operational bottlenecks.</p>
            <p className="nv-eyebrow" style={{ marginTop: 16 }}>What we evaluate</p>
            <div className="grid gap-2 md:grid-cols-2" style={{ marginTop: 8 }}>
              {ASSESSMENT_EVALUATION.map((item) => (
                <div key={item} className="nv-pill nv-pill-muted">{item}</div>
              ))}
            </div>
            <p className="nv-eyebrow" style={{ marginTop: 16 }}>Outcome — a prioritized roadmap tied to</p>
            <div className="grid gap-2 md:grid-cols-3" style={{ marginTop: 8 }}>
              {ASSESSMENT_ROADMAP.map((item) => (
                <div key={item} className="nv-pill nv-pill-teal">{item}</div>
              ))}
            </div>
          </NvCard>

          <NvCard>
            <h3 className="nv-h3">AI Infrastructure Design</h3>
            <p className="nv-body">We design internal AI systems that replace high-cost tools and streamline operations.</p>
            <div className="grid gap-2 md:grid-cols-2" style={{ marginTop: 16 }}>
              {['Internal decision-support tools', 'Automated intake workflows', 'Risk evaluation engines', 'Reporting automation'].map((item) => (
                <div key={item} className="nv-pill nv-pill-muted">{item}</div>
              ))}
            </div>
            <p className="nv-body" style={{ marginTop: 16 }}>Outcome: a blueprint for a more scalable operating model.</p>
          </NvCard>

          <NvCard>
            <h3 className="nv-h3">Workflow Automation Deployment</h3>
            <p className="nv-body">We implement AI-native workflows that remove manual effort across high-impact functions.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" style={{ marginTop: 16 }}>
              {WORKFLOW_TARGETS.map((item) => (
                <div key={item} className="nv-pill nv-pill-muted">{item}</div>
              ))}
            </div>
            <p className="nv-body" style={{ marginTop: 16 }}>Outcome: immediate productivity gains and reduced execution friction.</p>
          </NvCard>

          <NvCard>
            <h3 className="nv-h3">SaaS Consolidation Strategy</h3>
            <p className="nv-body">A structured approach to reducing tool sprawl and replacing selected platforms.</p>
            <div className="grid gap-2 md:grid-cols-3" style={{ marginTop: 16 }}>
              {['Identify what to keep', 'Identify what to replace', 'Identify what to build internally'].map((item) => (
                <div key={item} className="nv-pill nv-pill-muted">{item}</div>
              ))}
            </div>
            <p className="nv-body" style={{ marginTop: 16 }}>Outcome: lower cost + greater operational control.</p>
          </NvCard>
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Engagement model</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {MODEL_PHASES.map((phase) => (
            <NvCard key={phase.title}>
              <h3 className="nv-h3">{phase.title}</h3>
              <p className="nv-body" style={{ margin: 0 }}>{phase.description}</p>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Ideal client profile</p>
        </div>
        <NvCard>
          <div className="grid gap-2 md:grid-cols-2">
            {ICP.map((item) => (
              <div key={item} className="nv-pill nv-pill-muted">{item}</div>
            ))}
          </div>
        </NvCard>
      </section>

      <section className="nv-section">
        <CategoryMessagingFramework />
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />See where you&apos;re overpaying</p>
        </div>
        <NvCard>
          <p className="nv-body">In one session, we identify where internal AI systems can reduce cost and increase speed.</p>
          <div style={{ marginTop: 24 }}>
            <NvButton variant="primary" href="/operational-assessment">Schedule executive assessment</NvButton>
          </div>
        </NvCard>
      </section>
    </div>
  );
}
