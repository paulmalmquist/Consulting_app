'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type DiagnosticMode = {
  key: string;
  label: string;
  above: { label: string; explainer: string }[];
  below: { label: string; explainer: string }[];
};

const modes: DiagnosticMode[] = [
  {
    key: 'crm',
    label: 'CRM (Sales)',
    above: [
      { label: 'Pipelines', explainer: 'Visible stages make uncertainty look managed.' },
      { label: 'Dashboards', explainer: 'Charts give a calm story before hard decisions.' },
      { label: 'Automation', explainer: 'Rules route activity so leaders avoid intervening.' }
    ],
    below: [
      { label: 'Decision enforcement', explainer: 'The software becomes the manager nobody wants to be.' },
      { label: 'Blame absorption', explainer: 'Missed targets get blamed on adoption, not strategy.' },
      { label: 'Forecast theater', explainer: 'Confidence gets reported even when inputs are fiction.' },
      { label: 'Institutional memory', explainer: 'Context lives in fields because conversations are fragile.' }
    ]
  },
  {
    key: 'comms',
    label: 'Internal Comms',
    above: [
      { label: 'Messaging', explainer: 'Fast talk feels like execution.' },
      { label: 'Channels', explainer: 'Rooms simulate structure without defining ownership.' },
      { label: 'Search', explainer: 'Findability substitutes for clear commitments.' }
    ],
    below: [
      { label: 'Avoided process definition', explainer: 'Ambiguity stays cheaper than writing the operating rule.' },
      { label: 'Fear of accountability', explainer: 'No one wants the final word preserved forever.' },
      { label: 'Conflict deferral', explainer: 'Threads postpone disagreements instead of resolving them.' },
      { label: 'Illusion of progress', explainer: 'Activity volume masks unresolved work.' }
    ]
  },
  {
    key: 'helpdesk',
    label: 'Helpdesk / Ops',
    above: [
      { label: 'Ticket queues', explainer: 'Backlogs create order at a glance.' },
      { label: 'SLA timers', explainer: 'Timing metrics stand in for outcome quality.' },
      { label: 'Macros', explainer: 'Templates accelerate responses while causes remain.' }
    ],
    below: [
      { label: 'Ownership vacuum', explainer: 'Tickets exist because root owners are undefined.' },
      { label: 'Process debt', explainer: 'Workarounds become policy by repetition.' },
      { label: 'Compliance theater', explainer: 'Closed status satisfies audits more than customers.' },
      { label: 'Escalation fatigue', explainer: 'Managers absorb exceptions the system cannot resolve.' }
    ]
  },
  {
    key: 'industry',
    label: 'Industry Systems',
    above: [
      { label: 'Workflow modules', explainer: 'Domain terms make generic logic feel specialized.' },
      { label: 'Standard reports', explainer: 'Prebuilt outputs calm regulators and investors.' },
      { label: 'Vendor integrations', explainer: 'Connectivity becomes a moat against internal redesign.' }
    ],
    below: [
      { label: 'Policy outsourcing', explainer: 'Operational judgment is delegated to vendor defaults.' },
      { label: 'Control surrender', explainer: 'Change velocity follows product roadmaps, not your needs.' },
      { label: 'Audit anxiety', explainer: 'Teams buy reassurance instead of building evidence routines.' },
      { label: 'Institutional amnesia', explainer: 'Critical know-how leaves when admins leave.' }
    ]
  }
];

const selfAssessment = [
  'We rely on chat to make decisions.',
  'No one owns final answers.',
  'We search Slack before asking people.',
  'Tickets exist because ownership does not.',
  'Escalations happen after avoidable ambiguity.',
  'Our process lives in heroics, not systems.'
];

const WATERLINE_TOP = '40%';
const ABOVE_WATER_CHIPS = [
  'Features',
  'UI',
  'Convenience',
  'Onboarding',
  'Templates',
  'Integrations',
  'Automations',
  'Dashboards',
  'Reporting'
];

const BELOW_WATER_CHIPS = [
  'Conflict avoidance',
  'Process ownership',
  'Blame absorption',
  'Institutional memory',
  'Accountability',
  'Exception handling',
  'Audit trails',
  'Change control',
  'Role clarity'
];

export default function SaaSIcebergPage() {
  const [activeMode, setActiveMode] = useState<DiagnosticMode>(modes[0]);
  const [activeItem, setActiveItem] = useState<{ label: string; explainer: string }>(modes[0].below[0]);

  const activeAbove = useMemo(() => activeMode.above, [activeMode]);
  const activeBelow = useMemo(() => activeMode.below, [activeMode]);

  return (
    <div className="nv-page">
      <section className="relative overflow-hidden rounded-[var(--nv-radius-lg)] bg-gradient-to-b from-[rgb(var(--nv-surface)/0.8)] via-[rgb(var(--nv-bg)/0.7)] to-[#051022] p-6 sm:p-10">
        <div className="pointer-events-none absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-[50%] bg-[rgb(var(--nv-accent-teal)/0.10)] blur-3xl" />
        <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />The SaaS Iceberg</p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 12 }}>What you&apos;re <em>really</em> paying for.</h1>
        <p className="nv-lede" style={{ color: 'rgb(var(--nv-accent-teal)/0.85)' }}>
          Most SaaS pricing is justified below the waterline.
        </p>

        <div className="relative mt-8 h-[320px] rounded-[var(--nv-radius-lg)] border border-nv-teal/18 bg-nv-bg/80 p-5 sm:h-[380px]">
          <div className="absolute left-0 h-px w-full bg-nv-teal/10" style={{ top: WATERLINE_TOP }} aria-hidden="true" />
          <div className="absolute left-1/2 top-[17%] h-24 w-32 -translate-x-1/2 rounded-[45%_45%_35%_35%] border border-nv-teal/18 bg-gradient-to-b from-cyan-100/30 to-cyan-200/10  animate-pulse" />
          <div className="absolute left-1/2 top-[33%] h-44 w-72 -translate-x-1/2 rounded-[45%_45%_55%_55%] border border-nv-teal/18 bg-gradient-to-b from-cyan-300/10 to-transparent" />
          <div className="absolute bottom-0 left-0 h-[60%] w-full bg-gradient-to-b from-cyan-700/20 via-cyan-900/20 to-nv-bg/70" />

          <div className="absolute top-5 right-5 left-5 z-20 rounded-2xl border border-nv-teal/18 bg-nv-bg/60 p-4 md:p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-nv-teal/80">Above the water</p>
            <div className="mt-3 flex min-w-0 flex-wrap gap-2 overflow-hidden md:flex-nowrap">
              {ABOVE_WATER_CHIPS.map((item) => (
                <span
                  key={item}
                  className="rounded-[4px] border border-nv-teal/18 bg-nv-teal/10 px-3 py-1 text-xs text-nv-teal transition hover:border-nv-teal/18 md:shrink-0"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div
            className="absolute right-5 left-5 z-20 rounded-2xl border border-violet-200/15 bg-nv-bg/60 p-4 md:p-5"
            style={{ top: `calc(${WATERLINE_TOP} + 16px)` }}
          >
            <p className="text-xs uppercase tracking-[0.22em] text-nv-copper">Below the water</p>
            <div className="mt-3 flex min-w-0 flex-wrap justify-end gap-2 overflow-hidden md:flex-nowrap">
              {BELOW_WATER_CHIPS.map((item) => (
                <span
                  key={item}
                  className="rounded-[999px] border border-violet-200/30 bg-violet-300/5 px-3 py-1 text-xs text-nv-copper transition hover:border-violet-200/50 md:shrink-0"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-card" style={{ padding: '20px 24px' }}>
        <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 20 }}>
          {modes.map((mode) => {
            const active = activeMode.key === mode.key;
            return (
              <button
                key={mode.key}
                type="button"
                onClick={() => {
                  setActiveMode(mode);
                  setActiveItem(mode.below[0]);
                }}
                className={`rounded-[var(--nv-radius-sm)] border px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] transition ${
                  active
                    ? 'border-nv-teal/18 bg-nv-teal/10 text-nv-teal'
                    : 'border-nv-text/12 bg-nv-bg/80 text-nv-muted hover:border-nv-teal/18 hover:text-nv-teal'
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-nv-teal/18 bg-nv-bg/80 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-nv-teal/80">Above water signals</p>
              <div className="mt-3 space-y-2">
                {activeAbove.map((item) => (
                  <button
                    type="button"
                    key={item.label}
                    onMouseEnter={() => setActiveItem(item)}
                    onFocus={() => setActiveItem(item)}
                    onClick={() => setActiveItem(item)}
                    className="block w-full rounded-xl border border-nv-teal/18 bg-nv-teal/10 px-3 py-2 text-left text-sm text-nv-teal transition hover:border-nv-teal/18"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-violet-200/20 bg-nv-bg/80 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-nv-copper">Below water realities</p>
              <div className="mt-3 space-y-2">
                {activeBelow.map((item) => (
                  <button
                    type="button"
                    key={item.label}
                    onMouseEnter={() => setActiveItem(item)}
                    onFocus={() => setActiveItem(item)}
                    onClick={() => setActiveItem(item)}
                    className="block w-full rounded-xl border border-violet-200/20 bg-violet-300/5 px-3 py-2 text-left text-sm text-nv-text transition hover:border-violet-200/50"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="nv-card" style={{ padding: 20 }}>
            <p className="nv-eyebrow">Hover diagnostic</p>
            <p className="nv-h3" style={{ marginTop: 12 }}>{activeItem.label}</p>
            <p className="nv-body" style={{ margin: 0 }}>{activeItem.explainer}</p>
          </aside>
        </div>
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Where are you compensating?</p>
        </div>
        <div className="nv-card" style={{ padding: '20px 24px' }}>
          <p className="nv-body" style={{ marginBottom: 20 }}>Mentally check every statement that feels true.</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {selfAssessment.map((statement) => (
              <li key={statement} className="rounded-[var(--nv-radius-md)] border border-[rgb(var(--nv-hair-soft)/0.10)] bg-[rgb(var(--nv-bg)/0.8)] p-4 text-sm text-[rgb(var(--nv-text-primary))]">
                <span className="mr-2 text-[rgb(var(--nv-accent-teal))]">☐</span>
                {statement}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Reframe</p>
          <h2 className="nv-h2">These are not software problems.</h2>
          <p className="nv-lede" style={{ color: 'rgb(var(--nv-accent-teal))' }}>They are ownership problems.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { title: 'Vendors monetize avoidance', pct: '82%', note: 'Licenses scale with unresolved ambiguity.' },
            { title: 'Internal systems force clarity', pct: '58%', note: 'Rules become explicit and defensible.' },
            { title: 'Ownership lowers total cost', pct: '34%', note: 'Fewer tools. Fewer escalations. Better memory.' }
          ].map((item) => (
            <div key={item.title} className="nv-card" style={{ padding: 16 }}>
              <p className="nv-h3">{item.title}</p>
              <div className="mt-3 h-2 rounded-[2px] bg-[rgb(var(--nv-surface-raised))]">
                <div className={`h-2 rounded-[2px] bg-gradient-to-r from-violet-300/70 to-cyan-300/70`} style={{ width: item.pct }} />
              </div>
              <p className="nv-body" style={{ marginTop: 12 }}>{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Next step</p>
        </div>
        <div className="nv-card" style={{ padding: '20px 24px' }}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="nv-h3">See what you&apos;re outsourcing.</h2>
              <p className="nv-body">Map the submerged cost before your next renewal cycle.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/operational-assessment" className="nv-btn nv-btn-primary">See What You&apos;re Outsourcing</Link>
              <Link href="/contact" className="nv-btn nv-btn-secondary">Build What You Actually Need</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
