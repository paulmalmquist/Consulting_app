import Link from 'next/link';
import { Building2, Scale, Stethoscope, Wallet } from 'lucide-react';
import { INDUSTRY_VERTICALS, type IndustryVertical } from '@content/industry-verticals';
import { industryBackgrounds } from '@/lib/marketing/industryThemes';
import { fileExistsInPublic } from '@/lib/marketing/publicAssets';
import { ControlLayerDiagram } from '../visual/ControlLayerDiagram';
import { HeroBackground } from '../HeroBackground';
import { NvButton } from '../ui/NvButton';
import { NvCard } from '../ui/NvCard';

const labels: Record<IndustryVertical['slug'], { label: string; Icon: typeof Building2; microCase: string }> = {
  'real-estate-private-equity': {
    label: 'AI-Ready Fund Data',
    Icon: Building2,
    microCase:
      'A mid-market PE firm rebuilt the data flow behind their capital calls. Errors dropped from 5% to 1%. The same data now feeds the LP report, the IC pack, and the AI summary the GP reads on a Sunday night.'
  },
  'consumer-credit': {
    label: 'AI-Ready Credit Decisions',
    Icon: Wallet,
    microCase:
      'A mid-market lender pulled their credit policy out of PDF, captured every override against the rule that triggered it, and rebuilt the exception queue as a workflow. Routing delays dropped 29%. The first AI assist they deployed cited policy by section number. The compliance team stopped asking what the model was doing.'
  },
  medical: {
    label: 'AI-Ready Revenue Cycle',
    Icon: Stethoscope,
    microCase:
      'A multi-site provider pulled denial data out of every payer portal into one queue with one set of rules. Denial rework dropped 27%. The AI denial-prediction tool they had been piloting for six months started catching denials before they happened — because, for the first time, it could see them all.'
  },
  legal: {
    label: 'AI-Ready Matter Data',
    Icon: Scale,
    microCase:
      'A regional firm rewrote intake for one practice group, captured matter state changes in the system, and tied billing narratives to the underlying events. Intake handoff errors dropped 34%. The drafting AI tool the firm had bought a year earlier finally produced output partners would sign — because the inputs finally matched the firm\'s actual taxonomy.'
  }
};

type IndustryVerticalPageProps = { industry: IndustryVertical };

/**
 * Wrap the first occurrence of `token` in <em> so the design system's
 * `.nv-h1 em` rule renders it in teal. Falls back to the raw string if
 * the token isn't present.
 */
function highlight(headline: string, token: string) {
  const idx = headline.indexOf(token);
  if (idx === -1) return headline;
  return (
    <>
      {headline.slice(0, idx)}
      <em>{token}</em>
      {headline.slice(idx + token.length)}
    </>
  );
}

export function IndustryVerticalPage({ industry }: IndustryVerticalPageProps) {
  const contactHref = `/contact?industry=${industry.slug}`;
  const industryLabel = labels[industry.slug];
  const bgPath = industryBackgrounds[industry.slug];
  const bgSrc = fileExistsInPublic(bgPath) ? bgPath : undefined;
  // Pick the first matching token: "AI-ready" if present, else "AI".
  const heroHighlightToken = industry.heroHeadline.includes('AI-ready') ? 'AI-ready' : 'AI';

  return (
    <>
      <HeroBackground imageSrc={bgSrc} imageAlt="" overlayOpacity={0.45}>
        <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />{industry.label}</p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24 }}>{highlight(industry.heroHeadline, heroHighlightToken)}</h1>
        <p className="nv-lede">{industry.heroSubheadline}</p>
        <div className="nv-pill nv-pill-teal" style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <industryLabel.Icon size={14} aria-hidden="true" /> {industryLabel.label}
        </div>
        <div style={{ marginTop: 28 }}>
          <NvButton variant="primary" href={contactHref}>Discuss your use case</NvButton>
        </div>
      </HeroBackground>

      <div className="nv-page" style={{ paddingTop: 0 }}>
        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Why it breaks</p>
          </div>
          <NvCard>
            {industry.whyItBreaks.intro ? (
              <p className="nv-body">{industry.whyItBreaks.intro}</p>
            ) : null}
            <ul className="nv-body" style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
              {industry.whyItBreaks.items.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </NvCard>
        </section>

        <section className="nv-section">
          <ControlLayerDiagram title={`${industry.label} Control Layer`} />
        </section>

        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />What we change</p>
          </div>
          <NvCard>
            {industry.whatWeChange.intro ? (
              <p className="nv-body">{industry.whatWeChange.intro}</p>
            ) : null}
            <ul className="nv-body" style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
              {industry.whatWeChange.items.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </NvCard>
        </section>

        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />What changed in practice</p>
          </div>
          <NvCard>
            <p className="nv-body" style={{ margin: 0 }}>{industryLabel.microCase}</p>
          </NvCard>
        </section>

        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />What changes for the team</p>
          </div>
          <NvCard>
            <ul className="nv-body" style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
              {industry.typicalResults.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {industry.controlStatement ? (
              <p className="nv-body" style={{ marginTop: 16, fontStyle: 'normal', color: 'rgb(var(--nv-text-tertiary))' }}>{industry.controlStatement}</p>
            ) : null}
          </NvCard>
        </section>

        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Next step</p>
          </div>
          <NvCard>
            <h2 className="nv-h3">{industry.pageEndCta}</h2>
            <p className="nv-body">Start with one workflow. Prove it on real data. Scale from there.</p>
            <div className="flex flex-wrap gap-3" style={{ marginTop: 24 }}>
              <NvButton variant="primary" href={contactHref}>Talk to us about {industry.label}</NvButton>
              <NvButton variant="secondary" href="/operational-assessment">Get an AI-readiness review</NvButton>
            </div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 24 }}>
              {INDUSTRY_VERTICALS.filter((item) => item.slug !== industry.slug).map((item) => (
                <Link key={item.slug} href={`/industries/${item.slug}`} className="nv-pill nv-pill-muted">
                  {item.label}
                </Link>
              ))}
            </div>
          </NvCard>
        </section>
      </div>
    </>
  );
}
