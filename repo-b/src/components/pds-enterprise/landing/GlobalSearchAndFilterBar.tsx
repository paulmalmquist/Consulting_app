export function GlobalSearchAndFilterBar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  industry,
  onIndustryChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  status: "all" | "stable" | "watching" | "pressured" | "critical";
  onStatusChange: (value: "all" | "stable" | "watching" | "pressured" | "critical") => void;
  industry: string;
  onIndustryChange: (value: string) => void;
}) {
  return (
    <section className="sticky top-0 z-10 rounded-2xl border border-bm-border/70 bg-bm-bg/90 p-3 backdrop-blur">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px]">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search account, market, issue, or action"
          className="rounded-lg border border-bm-border/60 bg-bm-surface/10 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
        />
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value as "all" | "stable" | "watching" | "pressured" | "critical")}
          className="rounded-lg border border-bm-border/60 bg-bm-surface/10 px-3 py-2 text-sm text-bm-text"
        >
          <option value="all">All statuses</option>
          <option value="critical">Critical</option>
          <option value="pressured">Pressured</option>
          <option value="watching">Watching</option>
          <option value="stable">Stable</option>
        </select>
        <select
          value={industry}
          onChange={(e) => onIndustryChange(e.target.value)}
          className="rounded-lg border border-bm-border/60 bg-bm-surface/10 px-3 py-2 text-sm text-bm-text"
        >
          <option value="all">All industries</option>
          <option value="infrastructure">Infrastructure</option>
          <option value="energy">Energy</option>
          <option value="public">Public sector</option>
        </select>
      </div>
    </section>
  );
}
