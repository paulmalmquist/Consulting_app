/**
 * CapabilityUnavailable — generic "Not available in current context" state.
 *
 * Fail-loud pattern (tips.md #17): when a capability is scaffolded but not
 * enabled for the current environment, render the full structural shell with
 * a credible empty state rather than a blank card, infinite skeleton, or
 * raw error toast.
 *
 * Use this wherever a page or panel has been wired into the nav but the
 * backend capability / MCP tool / feature flag is not live for the env.
 *
 * Contract:
 *   - capabilityKey: a stable identifier (e.g. "repe.waterfall", "pds.exec")
 *     surfaced to the user as a muted technical label and to telemetry.
 *   - title: human-readable name of the capability ("Waterfall Engine").
 *   - moduleLabel: optional top eyebrow ("REPE Financial Intelligence").
 *   - note: optional one-line explanation of *why* it is not available.
 *   - adminHint: overrides the default "Contact admin to enable." string.
 */

type CapabilityUnavailableProps = {
  capabilityKey: string;
  title: string;
  moduleLabel?: string;
  note?: string;
  adminHint?: string;
};

export default function CapabilityUnavailable({
  capabilityKey,
  title,
  moduleLabel,
  note,
  adminHint = "Contact admin to enable this capability for the current environment.",
}: CapabilityUnavailableProps) {
  return (
    <div
      data-testid="capability-unavailable"
      data-capability-key={capabilityKey}
      className="min-h-[40vh] px-6 py-12 md:px-10"
    >
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {moduleLabel ? (
          <div className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-500">
            {moduleLabel}
          </div>
        ) : null}
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Not available in the current environment. This surface is scaffolded
          but the underlying capability is not enabled here.
        </p>
        {note ? (
          <p className="mt-2 text-sm leading-7 text-slate-600">{note}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
            Status: unavailable
          </span>
          <span
            className="rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em]"
            style={{ backgroundColor: "#f1f5f9", color: "#334155" }}
          >
            {capabilityKey}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
            {adminHint}
          </span>
        </div>
      </div>
    </div>
  );
}
