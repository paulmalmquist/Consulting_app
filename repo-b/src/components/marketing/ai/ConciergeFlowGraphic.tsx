import { Bot, FileSearch, MessageSquare, ShieldCheck, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';

const iconClassName = 'h-5 w-5';

type Node = {
  title: string;
  description: string;
  icon: ReactNode;
  tone: 'cyan' | 'violet' | 'emerald';
};

const tones = {
  cyan: {
    border: 'border-nv-teal/18',
    bg: 'bg-nv-teal/10',
    text: 'text-nv-teal',
    icon: 'text-nv-teal'
  },
  violet: {
    border: 'border-violet-200/25',
    bg: 'bg-violet-300/10',
    text: 'text-nv-text',
    icon: 'text-nv-copper'
  },
  emerald: {
    border: 'border-nv-teal/18',
    bg: 'bg-nv-teal/10',
    text: 'text-nv-teal',
    icon: 'text-nv-teal'
  }
} as const;

const nodes: Node[] = [
  {
    title: 'Ask in plain English',
    description: 'Chat, email, or a form. The helper should handle real questions, not prompts.',
    icon: <MessageSquare className={iconClassName} aria-hidden="true" />,
    tone: 'cyan'
  },
  {
    title: 'Look up your sources',
    description: 'It reads the docs you already have: SOPs, tickets, contracts, policies.',
    icon: <FileSearch className={iconClassName} aria-hidden="true" />,
    tone: 'violet'
  },
  {
    title: 'Draft the next step',
    description: 'A reply, a code change, or a proposed action, with the “why” attached.',
    icon: <Bot className={iconClassName} aria-hidden="true" />,
    tone: 'cyan'
  },
  {
    title: 'Do work in your tools',
    description: 'When you want it: update a record, open a ticket, run a checklist.',
    icon: <Wrench className={iconClassName} aria-hidden="true" />,
    tone: 'emerald'
  },
  {
    title: 'Keep it safe + reviewable',
    description: 'Approvals, logging, and boundaries so it doesn’t “wing it” in production.',
    icon: <ShieldCheck className={iconClassName} aria-hidden="true" />,
    tone: 'violet'
  }
];

export function ConciergeFlowGraphic() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-nv-text/10 bg-gradient-to-b from-nv-bg/40 via-nv-bg/65 to-[#07172e] p-5 sm:p-6">
      <div className="pointer-events-none absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-nv-teal/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-violet-300/10 blur-3xl" />

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-nv-muted">How it works</p>
        <p className="text-[11px] uppercase tracking-[0.18em] text-nv-dim">Vendor-neutral</p>
      </div>

      <div className="mt-4 grid gap-3">
        {nodes.map((node, index) => {
          const tone = tones[node.tone];
          return (
            <div key={node.title} className="relative">
              {index !== 0 && (
                <span
                  className="pointer-events-none absolute -top-2 left-6 h-3 w-px bg-gradient-to-b from-nv-muted/0 via-nv-muted/60 to-nv-muted/0"
                  aria-hidden="true"
                />
              )}
              <div className={`rounded-2xl border ${tone.border} bg-nv-bg/80 p-4`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border ${tone.border} ${tone.bg} ${tone.icon}`}>
                    {node.icon}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${tone.text}`}>{node.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-nv-muted">{node.description}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-nv-text/12 bg-nv-bg/40 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-nv-dim">What this replaces</p>
        <p className="mt-2 text-sm text-nv-text">
          Copy/paste docs. Guessing. “Ask Bob.” Threads with no owner. Dashboards that don&apos;t answer the real question.
        </p>
      </div>
    </div>
  );
}
