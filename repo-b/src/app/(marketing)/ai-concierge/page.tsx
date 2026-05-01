import { HeroBackground } from '@/components/marketing/HeroBackground';
import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { SectionHeader } from '@/components/marketing/ui/SectionHeader';
import { fileExistsInPublic } from '@/lib/marketing/publicAssets';

const HERO_BG = '/assets/bg-ai-concierge.jpg';

const howItWorks = [
  {
    title: 'Question',
    detail: 'A team member asks the assistant a question tied to real work — an exception, an approval, a status check.'
  },
  {
    title: 'Answer with records',
    detail: 'The assistant pulls the data, rules, and prior approvals behind the answer, then drafts a recommendation a human can review.'
  },
  {
    title: 'Approve or adjust',
    detail: 'A person reviews the recommendation, approves it, edits it, or sends it back. Nothing acts on its own.'
  },
  {
    title: 'Trace the decision',
    detail: 'Every recommendation, approval, and override is recorded so the team can review what happened and why.'
  }
];

const safeguards = [
  'Human review on every action',
  'Role-based access to data and tools',
  'Recommendations tied to records',
  'Decisions and overrides are traceable'
];

const whatChanges = [
  'Faster, cleaner answers on recurring exceptions.',
  'Recommendations the team can defend, with the records behind them.',
  'A clear record of what was approved, by whom, and on what basis.',
  'AI use that holds up to a compliance review without surprises.'
];

export default function AIConciergePage() {
  const bgSrc = fileExistsInPublic(HERO_BG) ? HERO_BG : undefined;

  return (
    <>
      <HeroBackground imageSrc={bgSrc} imageAlt="" overlayOpacity={0.45}>
        <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />AI Concierge</p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24 }}>
          Help your team use AI with context, control, and confidence.
        </h1>
        <p className="nv-lede">
          We help your team apply AI to real work, using the data, rules, approvals, and records your business already depends on. The goal is simple: better answers, clearer next steps, and fewer unsupported decisions.
        </p>
        <div className="flex flex-wrap gap-3" style={{ marginTop: 28 }}>
          <NvButton variant="primary" href="/contact">Talk through your AI use</NvButton>
          <NvButton variant="secondary" href="/operational-assessment">Get an AI-readiness review</NvButton>
        </div>
      </HeroBackground>

      <div className="nv-page" style={{ paddingTop: 0 }}>
        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Example interaction</p>
          </div>
          <NvCard>
            <p className="nv-body"><strong>Team member:</strong> A capital call exception just crossed the threshold. Should we escalate?</p>
            <p className="nv-body" style={{ marginTop: 12 }}>
              <strong>Concierge:</strong> Yes — escalate to the finance approver. The variance is above the 2.5% threshold. Two similar items last quarter were approved by the owner with notes attached. The records behind this recommendation are linked.
            </p>
          </NvCard>
        </section>

        <section className="nv-section">
          <SectionHeader
            eyebrow="How it works"
            headline="Four steps, every time."
            description="Every recommendation runs through the same path: question, answer with records, approve or adjust, trace the decision."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {howItWorks.map((step, idx) => (
              <NvCard key={step.title}>
                <p className="nv-eyebrow" style={{ marginBottom: 12 }}>{String(idx + 1).padStart(2, '0')}</p>
                <h3 className="nv-h3" style={{ marginBottom: 8 }}>{step.title}</h3>
                <p className="nv-body" style={{ margin: 0 }}>{step.detail}</p>
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
              <NvButton variant="primary" href="/contact">Talk through your AI use</NvButton>
              <NvButton variant="secondary" href="/operational-assessment">Get an AI-readiness review</NvButton>
            </div>
          </NvCard>
        </section>
      </div>
    </>
  );
}
