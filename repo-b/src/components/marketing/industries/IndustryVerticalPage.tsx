import Link from 'next/link';
import { Building2, Scale, Stethoscope, Wallet } from 'lucide-react';
import { INDUSTRY_VERTICALS, type IndustryVertical } from '@content/industry-verticals';
import { INDUSTRY_THEME_STYLES, industryBackgrounds } from '@/lib/marketing/industryThemes';
import { fileExistsInPublic } from '@/lib/marketing/publicAssets';
import { cn } from '../ui/cn';
import { BeforeAfterDiagram } from '../visual/BeforeAfterDiagram';
import { ControlLayerDiagram } from '../visual/ControlLayerDiagram';
import { SloganBadge } from '../visual/SloganBadge';
import { HeroBackground } from '../HeroBackground';

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

export function IndustryVerticalPage({ industry }: IndustryVerticalPageProps) {
  const theme = INDUSTRY_THEME_STYLES[industry.themeKey];
  const contactHref = `/contact?industry=${industry.slug}`;
  const industryLabel = labels[industry.slug];
  const bgPath = industryBackgrounds[industry.slug];
  const bgSrc = fileExistsInPublic(bgPath) ? bgPath : undefined;

  return (
    <div className="space-y-8 lg:space-y-10">
      <HeroBackground imageSrc={bgSrc} imageAlt="" overlayOpacity={0.6}>
        <SloganBadge />
        <p className="mt-4 text-sm uppercase tracking-[0.2em] text-nv-dim">{industry.label}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-nv-text sm:text-5xl">{industry.heroHeadline}</h1>
        <p className="mt-4 max-w-3xl text-sm text-nv-muted sm:text-base">{industry.heroSubheadline}</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-[4px] border border-nv-teal/25 bg-nv-teal/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-nv-teal">
          <industryLabel.Icon size={14} aria-hidden="true" /> {industryLabel.label}
        </div>
      </HeroBackground>

      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
        <h2 className="text-2xl font-semibold text-nv-text">Why It Breaks</h2>
        {industry.whyItBreaks.intro ? (
          <p className="mt-3 text-sm text-nv-muted">{industry.whyItBreaks.intro}</p>
        ) : null}
        <ul className="mt-4 space-y-2 text-sm text-nv-text">
          {industry.whyItBreaks.items.slice(0, 4).map((item) => (
            <li key={item} className="rounded-xl border border-nv-text/10 bg-nv-bg/40 p-3">{item}</li>
          ))}
        </ul>
      </section>

      <BeforeAfterDiagram title={`${industry.label}: Before → After`} />
      <ControlLayerDiagram title={`${industry.label} Control Layer`} />

      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
        <h2 className="text-2xl font-semibold text-nv-text">What We Change</h2>
        {industry.whatWeChange.intro ? (
          <p className="mt-3 text-sm text-nv-muted">{industry.whatWeChange.intro}</p>
        ) : null}
        <ul className="mt-4 space-y-2 text-sm text-nv-text">
          {industry.whatWeChange.items.slice(0, 4).map((item) => (
            <li key={item} className="rounded-xl border border-nv-text/10 bg-nv-bg/40 p-3">{item}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
        <p className="text-xs uppercase tracking-[0.14em] text-nv-teal">What changed in practice</p>
        <p className="mt-2 text-sm text-nv-muted">{industryLabel.microCase}</p>
      </section>

      <section className={cn('rounded-3xl border p-6', theme.impactSection)}>
        <SloganBadge className="mb-4" />
        <h2 className="text-2xl font-semibold text-nv-text">What changes for the team</h2>
        <ul className="mt-3 space-y-2 text-sm text-nv-text">
          {industry.typicalResults.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {industry.controlStatement ? (
          <p className="mt-5 text-sm italic text-nv-muted">{industry.controlStatement}</p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-nv-text/8 bg-nv-bg/80 p-6 sm:p-8">
        <h2 className="text-2xl font-semibold tracking-tight text-nv-text md:text-3xl">{industry.pageEndCta}</h2>
        <p className="mt-2 text-sm text-nv-muted sm:text-base">Start with one workflow. Prove it on real data. Scale from there.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={contactHref} className={theme.primaryCta}>Talk to us about {industry.label}</Link>
          <Link href="/operational-assessment" className="rounded-full border border-nv-text/12 px-5 py-2.5 text-sm font-semibold text-nv-text">Get an AI-readiness review</Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {INDUSTRY_VERTICALS.filter((item) => item.slug !== industry.slug).map((item) => (
            <Link key={item.slug} href={`/industries/${item.slug}`} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold', theme.quickSwitchInactive)}>{item.label}</Link>
          ))}
        </div>
      </section>
    </div>
  );
}
