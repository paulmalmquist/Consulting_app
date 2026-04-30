import Link from 'next/link';
import { ArrowRight, Boxes, Cog, Workflow } from 'lucide-react';

type ShiftTeaserProps = {
  title: string;
  oneLiner: string;
  button: { label: string; href: string };
};

const teaserItems = [
  { title: 'Then', detail: 'Many apps split one process.', icon: Boxes },
  { title: 'Consolidate', detail: 'Execution moves into one layer.', icon: Workflow },
  { title: 'Now', detail: 'Engine, governance, and audit together.', icon: Cog }
];

export function ShiftTeaser({ title, oneLiner, button }: ShiftTeaserProps) {
  return (
    <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6 sm:p-8">
      <div className="space-y-3">
        <p className="text-sm uppercase tracking-[0.2em] text-nv-dim">The Shift</p>
        <h2 className="text-2xl font-semibold tracking-tight text-nv-text md:text-3xl">{title}</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-nv-muted sm:text-base">{oneLiner}</p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {teaserItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="rounded-2xl border border-nv-text/8 bg-nv-bg/80 p-4 transition hover:border-nv-text/16"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-nv-text/12 bg-nv-text/[0.05] text-nv-muted">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-nv-text">{item.title}</p>
              </div>
              <p className="mt-3 text-sm text-nv-muted">{item.detail}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-6">
        <Link
          href={button.href}
          className="inline-flex items-center gap-2 rounded-full border border-nv-text/20 bg-nv-text/[0.05] px-5 py-2 text-sm font-semibold text-nv-text transition hover:border-nv-text/35 hover:bg-nv-text/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-teal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg"
        >
          {button.label}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
