import type { Metadata } from 'next';
import { HeroBackground } from '@/components/marketing/HeroBackground';
import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { TradesCarousel } from '@/components/marketing/industries/TradesCarousel';
import { fileExistsInPublic } from '@/lib/marketing/publicAssets';

const HERO_BG = '/assets/bg-trades.jpg';

export const metadata: Metadata = {
  title: 'Run the work from estimate to invoice — Novendor',
  description:
    'Novendor gives trade businesses one operating layer for jobs, crews, customers, schedules, documents, and cash flow — intake, dispatch, estimates, materials, and invoicing in one place.',
  alternates: {
    canonical: '/industries/trades',
  },
  openGraph: {
    title: 'Run the work from estimate to invoice — Novendor',
    description:
      'One operating layer for trade businesses: jobs, crews, scheduling, estimates, materials, and invoices. Keep the tools that work. Bring the work into one place.',
    url: 'https://www.novendor.ai/industries/trades',
    type: 'website',
  },
};

const supportLabels = [
  'Jobs',
  'Crews',
  'Scheduling',
  'Estimates',
  'Invoices',
  'Materials',
  'Customer history',
];

const problems = [
  'Calls become work orders',
  'Estimates lose context',
  'Crews need cleaner schedules',
  'Materials need tracking',
  'Invoices need backup',
  'Owners need a clear view',
];

const capabilities = [
  {
    title: 'Job intake',
    body: 'Capture calls, forms, emails, and repeat work requests in one queue.',
  },
  {
    title: 'Scheduling and dispatch',
    body: 'Assign crews, track timing, and keep the day visible.',
  },
  {
    title: 'Estimate tracking',
    body: 'Keep pricing, scope, photos, notes, and approvals together.',
  },
  {
    title: 'Field updates',
    body: 'Record job status, blockers, materials, and completion notes.',
  },
  {
    title: 'Invoice readiness',
    body: 'Tie work performed to backup, approvals, and customer records.',
  },
  {
    title: 'Owner view',
    body: 'Show open jobs, aging estimates, crew load, cash timing, and exceptions.',
  },
];

const systems = [
  'QuickBooks',
  'Excel / Google Sheets',
  'ServiceTitan-style dispatch tools',
  'CRM notes',
  'Email and text intake',
  'Shared drives',
  'Job photo folders',
  'Forms and checklists',
];

const outcomes = [
  'See every open job',
  'Know what needs attention today',
  'Reduce missed follow-up',
  'Shorten estimate-to-invoice time',
  'Track crew and job status',
  'Keep proof with the work',
  'Give owners one clear view',
];

const trades = [
  {
    title: 'Plumbing',
    description: 'Emergency calls, repeat customers, estimates, parts, job notes, invoices.',
  },
  {
    title: 'HVAC',
    description: 'Service plans, installs, dispatch, materials, warranties, seasonal demand.',
  },
  {
    title: 'Landscaping',
    description: 'Routes, crews, recurring work, change orders, photos, customer requests.',
  },
  {
    title: 'Electrical',
    description: 'Estimates, inspections, safety notes, job packets, commercial service.',
  },
  {
    title: 'Roofing',
    description: 'Leads, scopes, photos, claims, crews, materials, payment timing.',
  },
  {
    title: 'Cleaning and maintenance',
    description: 'Recurring schedules, site notes, checklists, exceptions, customer history.',
  },
];

export default function TradesPage() {
  const bgSrc = fileExistsInPublic(HERO_BG) ? HERO_BG : undefined;

  return (
    <>
      <HeroBackground imageSrc={bgSrc} imageAlt="" overlayOpacity={0.45}>
        <p className="nv-eyebrow">
          <span className="nv-eyebrow-dot" />
          Trades / Field operations
        </p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24 }}>
          Run the work from <em>estimate to invoice</em>.
        </h1>
        <p className="nv-lede">
          Novendor gives trade businesses one operating layer for jobs, crews, customers,
          schedules, documents, and cash flow. Keep the tools that work. Bring the work into one
          place.
        </p>
        <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <NvButton variant="primary" href="#how-it-works">
            See how it works →
          </NvButton>
          <NvButton variant="secondary" href="/capabilities">
            View capabilities
          </NvButton>
        </div>
        <ul
          aria-label="What the operating layer covers"
          style={{
            marginTop: 32,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 18px',
            fontFamily: 'var(--font-marketing-mono), ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgb(var(--nv-text-tertiary))',
          }}
        >
          {supportLabels.map((item, idx) => (
            <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <span>{item}</span>
              {idx < supportLabels.length - 1 ? (
                <span aria-hidden style={{ color: 'rgb(var(--nv-text-muted))' }}>
                  ·
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </HeroBackground>

      <div className="nv-page nv-page--wide" style={{ paddingTop: 0 }}>
        <section className="nv-section" aria-label="The problem">
          <div className="nv-section-head">
            <p className="nv-eyebrow">
              <span className="nv-eyebrow-dot" />
              The problem
            </p>
          </div>
          <h2 className="nv-h2" style={{ marginBottom: 16 }}>
            The work is moving faster than the back office.
          </h2>
          <p className="nv-lede" style={{ maxWidth: 760, margin: 0 }}>
            Trade businesses run on calls, texts, spreadsheets, accounting tools, job photos,
            estimates, and crew updates. The business works because people remember what matters.
            That breaks down as volume grows.
          </p>
          <div className="grid gap-6 md:grid-cols-3" style={{ marginTop: 36 }}>
            {problems.map((title) => (
              <NvCard key={title}>
                <h3 className="nv-h3" style={{ margin: 0 }}>
                  {title}
                </h3>
              </NvCard>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="nv-section" aria-label="What Novendor does">
          <div className="nv-section-head">
            <p className="nv-eyebrow">
              <span className="nv-eyebrow-dot" />
              What Novendor does
            </p>
          </div>
          <h2 className="nv-h2" style={{ marginBottom: 16 }}>
            One execution layer for the operating day.
          </h2>
          <p className="nv-lede" style={{ maxWidth: 760, margin: 0 }}>
            Novendor connects the daily flow of work: intake, estimate, scheduling, dispatch, job
            status, materials, documents, approvals, invoicing, and follow-up.
          </p>
          <div className="grid gap-6 md:grid-cols-3" style={{ marginTop: 36 }}>
            {capabilities.map((card) => (
              <NvCard key={card.title}>
                <h3 className="nv-h3" style={{ marginBottom: 12 }}>
                  {card.title}
                </h3>
                <p className="nv-body" style={{ margin: 0 }}>
                  {card.body}
                </p>
              </NvCard>
            ))}
          </div>
        </section>

        <section className="nv-section" aria-label="Systems absorbed">
          <div className="nv-section-head">
            <p className="nv-eyebrow">
              <span className="nv-eyebrow-dot" />
              Keep the tools
            </p>
          </div>
          <h2 className="nv-h2" style={{ marginBottom: 16 }}>
            Keep the tools. Control the flow.
          </h2>
          <p className="nv-lede" style={{ maxWidth: 760, margin: 0 }}>
            Novendor can sit beside the tools a trade business already uses and give the owner a
            cleaner operating view.
          </p>
          <div className="grid gap-4 md:grid-cols-4" style={{ marginTop: 36 }}>
            {systems.map((title) => (
              <NvCard key={title}>
                <h3 className="nv-h3" style={{ margin: 0 }}>
                  {title}
                </h3>
              </NvCard>
            ))}
          </div>
          <p className="nv-body" style={{ marginTop: 24, color: 'rgb(var(--nv-text-secondary))' }}>
            These tools stay useful. The work just needs a common operating layer on top of them.
          </p>
        </section>

        <section className="nv-section" aria-label="Outcomes">
          <div className="nv-section-head">
            <p className="nv-eyebrow">
              <span className="nv-eyebrow-dot" />
              Outcomes
            </p>
          </div>
          <h2 className="nv-h2" style={{ marginBottom: 16 }}>
            Cleaner jobs. Faster billing. Fewer missed handoffs.
          </h2>
          <div className="grid gap-6 md:grid-cols-3" style={{ marginTop: 36 }}>
            {outcomes.map((title) => (
              <NvCard key={title}>
                <h3 className="nv-h3" style={{ margin: 0 }}>
                  {title}
                </h3>
              </NvCard>
            ))}
          </div>
        </section>

        <section className="nv-section" aria-label="Built for field-heavy businesses">
          <TradesCarousel title="Built for field-heavy businesses." items={trades} />
        </section>

        <section className="nv-section" aria-label="Final call to action">
          <NvCard>
            <h2 className="nv-h3" style={{ marginBottom: 12 }}>
              Give the business one place to run the day.
            </h2>
            <p className="nv-body" style={{ margin: 0 }}>
              Novendor helps trade owners keep control as work volume grows. The crews keep
              working. The office gets clearer. The owner sees what needs action.
            </p>
            <div style={{ marginTop: 24 }}>
              <NvButton variant="primary" href="/contact?industry=trades">
                Build the trades workflow →
              </NvButton>
            </div>
          </NvCard>
        </section>
      </div>
    </>
  );
}
