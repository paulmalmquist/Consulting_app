import { BeforeAfterDiagram } from '@/components/marketing/visual/BeforeAfterDiagram';
import { ControlLayerDiagram } from '@/components/marketing/visual/ControlLayerDiagram';
import { NvHero } from '@/components/marketing/home/NvHero';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { HeroBackground } from '@/components/marketing/HeroBackground';
import { HOMEPAGE_BACKGROUND } from '@/lib/marketing/industryThemes';
import { fileExistsInPublic } from '@/lib/marketing/publicAssets';

const steps = [
  { name: 'Discovery', detail: 'Map one high-friction workflow and baseline cycle time, error rate, and owner gaps.' },
  { name: 'Pilot', detail: 'Build controlled states, rules, and evidence in parallel with current operations.' },
  { name: 'Cutover', detail: 'Switch with rollback protection once outputs match and governance is approved.' },
];

export default function HomePage() {
  const bgSrc = fileExistsInPublic(HOMEPAGE_BACKGROUND) ? HOMEPAGE_BACKGROUND : undefined;

  return (
    <>
      <HeroBackground imageSrc={bgSrc} imageAlt="" overlayOpacity={0.6}>
        <NvHero
          eyebrow="AI-Ready"
          headline={
            <>
              Your <em>AI</em> is only as good as the data underneath it.
            </>
          }
          lede="We work with operators who are under pressure to ship AI and know their data, process, and playbooks aren't ready for it. We make them ready — one workflow at a time, without a rip-and-replace project."
          primaryCta={{ label: 'We can help', href: '/contact' }}
        />
      </HeroBackground>

      <div className="nv-page" style={{ paddingTop: 0 }}>
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
              From reporting drift to AI-ready fund data
            </h2>
            <p className="nv-body">
              A mid-market REPE operator pulled the data behind capital calls into one place, captured the approval logic in a workflow, and rebuilt the LP report from the underlying data instead of last quarter&apos;s deck. Capital call errors dropped from 5% to 1.2%. The same data now feeds the LP report, the IC pack, and an AI summary the GP reads on a Sunday night — without anyone tying out a spreadsheet first.
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
    </>
  );
}
