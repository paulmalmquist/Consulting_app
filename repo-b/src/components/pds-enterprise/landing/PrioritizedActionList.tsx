import { WinstonActionMenu } from "./WinstonActionMenu";
import type { PrioritizedItem } from "./types";
import { statusClasses, toCompactCurrency } from "./utils";

export function PrioritizedActionList({ items }: { items: PrioritizedItem[] }) {
  return (
    <section className="space-y-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Priority Queue</p>
        <h3 className="text-xl font-semibold text-bm-text">Prioritized Accounts & Opportunities</h3>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border border-bm-border/60 bg-bm-surface/15 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-base font-semibold text-bm-text">{item.name}</p>
                <p className="text-sm text-bm-muted2">{item.description}</p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${statusClasses(item.status)}`}>{item.status}</span>
            </div>
            <p className="mt-2 text-sm text-bm-text"><span className="text-bm-muted2">Issue:</span> {item.issueSummary}</p>
            <p className="text-sm text-bm-text"><span className="text-bm-muted2">Why now:</span> {item.whyNow}</p>
            <p className="text-sm text-bm-text"><span className="text-bm-muted2">Next move:</span> {item.nextMove}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-bm-muted2">
              <span>Exposure {toCompactCurrency(item.exposure)}</span>
              {item.tags.map((tag) => <span key={`${item.id}-${tag}`} className="rounded-full border border-bm-border/50 px-2 py-0.5">{tag}</span>)}
            </div>
            <div className="mt-3">
              <WinstonActionMenu />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
