import { ArrowRight } from 'lucide-react';

type BeforeAfterDiagramProps = {
  title?: string;
  beforeLabel?: string;
  afterLabel?: string;
};

const beforeItems = ['Spreadsheet chaos', 'Manual workflows', 'Broken handoffs'];
const afterItems = ['Controlled execution layer', 'State transitions', 'Audit trail'];

export function BeforeAfterDiagram({
  title = 'Before → After',
  beforeLabel = 'Before',
  afterLabel = 'After'
}: BeforeAfterDiagramProps) {
  return (
    <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
      <h3 className="text-lg font-semibold text-nv-text">{title}</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <article className="rounded-2xl border border-rose-300/25 bg-rose-950/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-nv-risk">{beforeLabel}</p>
          <ul className="mt-3 space-y-2 text-sm text-nv-text">
            {beforeItems.map((item) => (
              <li key={item} className="rounded-lg border border-nv-text/10 bg-nv-bg/40 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </article>
        <div className="mx-auto hidden h-10 w-10 items-center justify-center rounded-[4px] border border-nv-teal/25 bg-nv-teal/10 text-nv-teal md:flex">
          <ArrowRight size={16} aria-hidden="true" />
        </div>
        <article className="rounded-2xl border border-nv-teal/25 bg-nv-teal/6 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-nv-teal">{afterLabel}</p>
          <ul className="mt-3 space-y-2 text-sm text-nv-text">
            {afterItems.map((item) => (
              <li key={item} className="rounded-lg border border-nv-text/10 bg-nv-bg/40 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
