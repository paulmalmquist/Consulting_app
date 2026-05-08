import { HeroBackground } from '@/components/marketing/HeroBackground';
import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { SectionHeader } from '@/components/marketing/ui/SectionHeader';
import { AIControlBoard } from '@/components/marketing/visual/AIControlBoard';
import { fileExistsInPublic } from '@/lib/marketing/publicAssets';

const HERO_BG = '/assets/bg-ai-concierge.jpg';

const controlLayer = [
  {
    title: 'Request',
    detail: 'A user asks for an answer, action, report, exception review, or workflow step.'
  },
  {
    title: 'Route',
    detail: 'Novendor selects the right skill, system, model, context, and permission path.'
  },
  {
    title: 'Govern',
    detail: 'Token use, source access, business rules, approvals, and human review are applied before action.'
  },
  {
    title: 'Record',
    detail: 'Every recommendation, override, model call, source, and decision is logged.'
  }
];

const controlSurface = [
  {
    title: 'Skill registry',
    detail: 'Approved skills by function, industry, workflow, and data source.'
  },
  {
    title: 'Model and token control',
    detail: 'Track model use, cost, latency, and fit by task.'
  },
  {
    title: 'Prompt and context governance',
    detail: 'Keep business logic, approved language, and source rules consistent.'
  },
  {
    title: 'Access and approval paths',
    detail: 'Route sensitive work through the right users and permissions.'
  },
  {
    title: 'Optimization loop',
    detail: 'See which requests get used, overridden, or ignored. Track cost per task and where approvals slow things down.'
  },
  {
    title: 'Sprawl control',
    detail: 'Bring scattered copilots, spreadsheets, prompts, and one-off automations into one traceable layer.'
  }
];

const safeguards = [
  'Human review on sensitive work',
  'Role-based access to data and tools',
  'Recommendations tied to records',
  'Decisions and overrides logged',
  'Model and token use tracked',
  'Skills approved before they ship'
];

const whatChanges = [
  'A single place to see every AI request, model call, approval, and override.',
  'Cleaner answers on recurring exceptions, with the records behind them.',
  'Cost and risk you can manage — token use, model fit, and approval coverage are visible.',
  'AI use that holds up to a compliance review without surprises.'
];

export default function AIConciergePage() {
  const bgSrc = fileExistsInPublic(HERO_BG) ? HERO_BG : undefined;

  return (
    <>
      <HeroBackground imageSrc={bgSrc} imageAlt="" overlayOpacity={0.45} fallbackTone="concierge">
        <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Operating concierge for enterprise AI</p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24 }}>
          One place where AI work is <em>controlled</em>.
        </h1>
        <p className="nv-lede">
          AI work is spreading across the enterprise. Copilots, prompts, and one-off automations are already in use. No one owns how that work runs.
        </p>
        <p className="nv-lede" style={{ marginTop: 12 }}>
          Novendor centralizes that work in a governed operating layer.
        </p>
        <div style={{ marginTop: 28 }}>
          <NvButton variant="primary" href="/contact">Talk through your AI control layer</NvButton>
        </div>
      </HeroBackground>

      <div className="nv-page" style={{ paddingTop: 0 }}>
        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Control board</p>
          </div>
          <AIControlBoard />
        </section>

        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Example request</p>
          </div>
          <NvCard>
            <p className="nv-body"><strong>Request</strong> — Finance owner asks the assistant to review this week&apos;s variance exceptions over threshold.</p>
            <p className="nv-body" style={{ marginTop: 12 }}>
              <strong>Routed</strong> — variance-review skill, model gpt-4.1, ERP and prior approvals, finance-owner approval path.
            </p>
            <p className="nv-body" style={{ marginTop: 12 }}>
              <strong>Governed</strong> — 18,420 tokens used. Three exceptions flagged for human review. Escalations drafted with linked records.
            </p>
            <p className="nv-body" style={{ marginTop: 12 }}>
              <strong>Recorded</strong> — trace nv-48291. Decisions, overrides, model call, and sources logged.
            </p>
          </NvCard>
        </section>

        <section className="nv-section">
          <SectionHeader
            eyebrow="Control layer"
            headline="Govern AI where the work happens."
            description="Every AI request runs through the same path: route to the right skill and model, apply governance before action, record what happened."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {controlLayer.map((step, idx) => (
              <NvCard key={step.title}>
                <p className="nv-eyebrow" style={{ marginBottom: 12 }}>{String(idx + 1).padStart(2, '0')}</p>
                <h3 className="nv-h3" style={{ marginBottom: 8 }}>{step.title}</h3>
                <p className="nv-body" style={{ margin: 0 }}>{step.detail}</p>
              </NvCard>
            ))}
          </div>
        </section>

        <section className="nv-section">
          <SectionHeader
            eyebrow="Control surface"
            headline="Centralize the sprawl before it becomes permanent."
            description="One operating layer for the work, the models, and the people who approve it."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {controlSurface.map((item) => (
              <NvCard key={item.title}>
                <h3 className="nv-h3" style={{ marginBottom: 8 }}>{item.title}</h3>
                <p className="nv-body" style={{ margin: 0 }}>{item.detail}</p>
              </NvCard>
            ))}
          </div>
        </section>

        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Safeguards</p>
          </div>
          <NvCard>
            <div className="flex flex-wrap gap-2">
              {safeguards.map((item) => (
                <span key={item} className="nv-pill nv-pill-teal">{item}</span>
              ))}
            </div>
          </NvCard>
        </section>

        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />What changes</p>
          </div>
          <NvCard>
            <ul className="nv-body" style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
              {whatChanges.map((line) => (
                <li key={line} style={{ marginBottom: 8 }}>{line}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3" style={{ marginTop: 24 }}>
              <NvButton variant="primary" href="/contact">Talk through your AI control layer</NvButton>
              <NvButton variant="secondary" href="/operational-assessment">Get an AI-readiness review</NvButton>
            </div>
          </NvCard>
        </section>
      </div>
    </>
  );
}
