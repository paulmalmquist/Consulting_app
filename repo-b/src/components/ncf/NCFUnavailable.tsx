type NCFUnavailableProps = {
  title: string;
  lens?: "financial_reporting" | "operational_reporting" | "impact_reporting";
  note?: string;
};

export default function NCFUnavailable({ title, lens, note }: NCFUnavailableProps) {
  return (
    <div className="min-h-[60vh] px-6 py-16 md:px-10 lg:px-12">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-10 shadow-sm">
        <div className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-500">
          NCF Reporting &amp; Stewardship Model
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">{title}</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          Not available in current context. This surface is scaffolded as part of the environment&rsquo;s governed reporting model, but has no data wired to it yet.
        </p>
        {note ? (
          <p className="mt-3 text-sm leading-7 text-slate-600">{note}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">Status: scaffolded</span>
          {lens ? (
            <span
              className="rounded-full px-3 py-1 font-medium"
              style={{ backgroundColor: "#e9f5fb", color: "#11789d" }}
            >
              Reporting lens: {lens.replace("_", " ")}
            </span>
          ) : null}
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
            Contact admin to enable
          </span>
        </div>
      </div>
    </div>
  );
}
