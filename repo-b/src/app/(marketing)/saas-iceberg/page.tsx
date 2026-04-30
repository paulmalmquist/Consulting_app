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
    <div className="space-y-10 sm:space-y-14">
      <section className="relative overflow-hidden rounded-3xl border border-nv-text/8 bg-gradient-to-b from-nv-surface/80 via-nv-bg/70 to-[#051022] p-6 sm:p-10">
        <div className="pointer-events-none absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-nv-teal/10 blur-3xl" />
        <p className="text-xs uppercase tracking-[0.28em] text-nv-dim">The SaaS Iceberg</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-nv-text sm:text-5xl">What You&apos;re Really Paying For</h1>
        <p className="mt-3 max-w-2xl text-sm text-nv-teal/85 sm:text-base">
          Most SaaS pricing is justified below the waterline.
        </p>

        <div className="relative mt-8 h-[320px] rounded-3xl border border-nv-teal/18 bg-nv-bg/80 p-5 sm:h-[380px]">
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
                  className="rounded-full border border-violet-200/30 bg-violet-300/5 px-3 py-1 text-xs text-nv-copper transition hover:border-violet-200/50 md:shrink-0"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5 rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
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
                className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
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

          <aside className="rounded-2xl border border-nv-text/12 bg-nv-bg/70 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-nv-dim">Hover diagnostic</p>
            <p className="mt-3 text-lg font-semibold text-nv-text">{activeItem.label}</p>
            <p className="mt-2 text-sm text-nv-muted">{activeItem.explainer}</p>
          </aside>
        </div>
      </section>

      <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-nv-text sm:text-2xl">Where are you compensating?</h2>
        <p className="mt-2 text-sm text-nv-muted">Mentally check every statement that feels true.</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {selfAssessment.map((statement) => (
            <li key={statement} className="rounded-2xl border border-nv-text/12 bg-nv-bg/80 p-4 text-sm text-nv-text">
              <span className="mr-2 text-nv-teal">☐</span>
              {statement}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-5 rounded-3xl border border-nv-text/10 bg-gradient-to-br from-nv-surface/80 to-nv-bg/80 p-6 sm:p-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-nv-teal/70">Reframe</p>
          <h2 className="mt-2 text-2xl font-semibold text-nv-text sm:text-3xl">These Are Not Software Problems</h2>
          <p className="mt-2 text-base text-nv-teal">They are ownership problems.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-nv-text/12 bg-nv-bg/80 p-4">
            <p className="text-sm font-semibold text-nv-text">Vendors monetize avoidance</p>
            <div className="mt-3 h-2 rounded-full bg-nv-raised">
              <div className="h-2 w-[82%] rounded-full bg-gradient-to-r from-violet-300/70 to-cyan-300/70" />
            </div>
            <p className="mt-3 text-xs text-nv-muted">Licenses scale with unresolved ambiguity.</p>
          </div>
          <div className="rounded-2xl border border-nv-text/12 bg-nv-bg/80 p-4">
            <p className="text-sm font-semibold text-nv-text">Internal systems force clarity</p>
            <div className="mt-3 h-2 rounded-full bg-nv-raised">
              <div className="h-2 w-[58%] rounded-full bg-gradient-to-r from-cyan-300/60 to-cyan-100/70" />
            </div>
            <p className="mt-3 text-xs text-nv-muted">Rules become explicit and defensible.</p>
          </div>
          <div className="rounded-2xl border border-nv-text/12 bg-nv-bg/80 p-4">
            <p className="text-sm font-semibold text-nv-text">Ownership lowers total cost</p>
            <div className="mt-3 h-2 rounded-full bg-nv-raised">
              <div className="h-2 w-[34%] rounded-full bg-gradient-to-r from-nv-teal/35 to-cyan-200/70" />
            </div>
            <p className="mt-3 text-xs text-nv-muted">Fewer tools. Fewer escalations. Better memory.</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-nv-teal/18 bg-nv-surface/75 p-6 sm:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-nv-text">See What You&apos;re Outsourcing</h2>
            <p className="mt-2 text-sm text-nv-muted">Map the submerged cost before your next renewal cycle.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/operational-assessment"
              className="rounded-[4px] border border-nv-teal/18 bg-nv-teal/10 px-5 py-3 text-sm font-semibold text-nv-teal transition hover:bg-nv-teal/10"
            >
              See What You&apos;re Outsourcing
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-nv-text/16 bg-nv-bg/70 px-5 py-3 text-sm font-semibold text-nv-text transition hover:border-nv-teal/18 hover:text-nv-teal"
            >
              Build What You Actually Need
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
