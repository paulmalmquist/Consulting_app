'use client';

import { useRef, useState } from 'react';
import { Bot, Boxes, Cog, Database, Receipt } from 'lucide-react';
import { cn } from '../ui/cn';

type TimelineStep = {
  title: string;
  line: string;
  icon: typeof Boxes;
};

const TIMELINE_STEPS: TimelineStep[] = [
  { title: 'Tool Sprawl', line: 'Work split across specialized systems.', icon: Boxes },
  { title: 'Hidden Tax', line: 'Manual reconciliation becomes the job.', icon: Receipt },
  { title: 'Central Data', line: 'Data consolidates; APIs become standard.', icon: Database },
  { title: 'Automation Layer', line: 'AI/automation executes repeatable work.', icon: Bot },
  { title: 'Execution Engine', line: 'One place to run, log, and govern.', icon: Cog }
];

export function RegimeTimeline() {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % TIMELINE_STEPS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + TIMELINE_STEPS.length) % TIMELINE_STEPS.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = TIMELINE_STEPS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <section aria-labelledby="regime-timeline-title" className="space-y-5 rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-4 sm:p-6 lg:p-8">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-nv-teal">Regime Timeline</p>
        <h2 id="regime-timeline-title" className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
          From tool patching to governed execution.
        </h2>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-nv-raised/90" aria-hidden="true">
        <div
          className="h-full rounded-full bg-gradient-to-r from-nv-teal/35 via-nv-teal/55 to-nv-teal/70 transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${((active + 1) / TIMELINE_STEPS.length) * 100}%` }}
        />
      </div>

      <div aria-label="Regime timeline steps" className="grid gap-3 md:grid-cols-5">
        {TIMELINE_STEPS.map((step, index) => {
          const Icon = step.icon;
          const selected = index === active;

          return (
            <button
              key={step.title}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              aria-pressed={selected}
              aria-label={`Regime timeline step ${index + 1}: ${step.title}`}
              onClick={() => setActive(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'h-full rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-teal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg',
                selected
                  ? 'border-nv-teal/25 bg-nv-teal/8 text-nv-teal'
                  : 'border-nv-text/8 bg-nv-bg/80 text-nv-muted hover:border-nv-teal/25'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-nv-teal/25 bg-nv-teal/8">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span className="text-xs uppercase tracking-[0.08em]">Step {index + 1}</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-white">{step.title}</p>
              <p className="mt-2 text-xs leading-relaxed text-nv-muted">
                {step.line}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
