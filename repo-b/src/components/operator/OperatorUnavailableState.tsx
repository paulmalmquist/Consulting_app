"use client";

const FILESYSTEM_PATH_PATTERN = /\/[\w./-]+\.(?:json|ya?ml|toml|env)/g;

function sanitize(detail: string | null | undefined): string {
  if (!detail) return "";
  return detail.replace(FILESYSTEM_PATH_PATTERN, "[redacted]");
}

function extractErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const anyErr = err as { code?: unknown; cause?: { code?: unknown } };
  const code = typeof anyErr.code === "string" ? anyErr.code : null;
  if (code) return code;
  const causeCode = typeof anyErr.cause?.code === "string" ? anyErr.cause.code : null;
  return causeCode;
}

export type OperatorUnavailableProps = {
  title?: string;
  detail?: string | null;
  error?: unknown;
  onRetry?: () => void;
  requestId?: string | null;
  supplementalLines?: string[];
};

export function OperatorUnavailableState(props: OperatorUnavailableProps) {
  const rawDetail =
    props.detail ??
    (props.error instanceof Error ? props.error.message : null) ??
    null;
  const detail = sanitize(rawDetail);
  const code = extractErrorCode(props.error);
  const isDemoWarmup =
    code === "operator.demo_unavailable" ||
    /demo data is not available/i.test(detail ?? "");

  if (isDemoWarmup) {
    return (
      <div className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200">
          Demo environment
        </p>
        <h2 className="mt-2 text-xl font-semibold text-bm-text">
          Demo environment warming up
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-bm-muted2">
          The Hall Boys operating-system demo is seeded from a deterministic fixture
          that is still loading on this environment. Executive, Site Risk, and
          Closeout surfaces will populate as soon as it lands.
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-6 text-sm text-bm-muted2">
          <li>Weekly operating narrative with $ and time-to-failure impact</li>
          <li>Action queue with consequence modeling per item</li>
          <li>Site Feasibility Engine + Ordinance Intelligence</li>
          <li>Municipality Scorecard and closeout cash-at-risk</li>
        </ul>
        {props.supplementalLines?.length ? (
          <ul className="mt-4 space-y-1 text-sm text-bm-muted2">
            {props.supplementalLines.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        ) : null}
        {props.onRetry ? (
          <button
            type="button"
            onClick={props.onRetry}
            className="mt-5 rounded-full border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-100 hover:bg-amber-500/25"
          >
            Retry
          </button>
        ) : null}
        {props.requestId ? (
          <details className="mt-4 text-xs text-bm-muted2/80">
            <summary className="cursor-pointer">Diagnostics</summary>
            <p className="mt-1">Request ID: {props.requestId}</p>
          </details>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
      <p className="text-[11px] uppercase tracking-[0.18em] text-red-200">
        Unable to load
      </p>
      <h2 className="mt-2 text-xl font-semibold text-bm-text">
        {props.title ?? "Executive surface unavailable"}
      </h2>
      {detail ? (
        <p className="mt-3 max-w-2xl text-sm text-red-200">{detail}</p>
      ) : (
        <p className="mt-3 text-sm text-red-200">The service returned no data.</p>
      )}
      {props.onRetry ? (
        <button
          type="button"
          onClick={props.onRetry}
          className="mt-5 rounded-full border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm text-red-100 hover:bg-red-500/20"
        >
          Retry
        </button>
      ) : null}
      {props.requestId ? (
        <details className="mt-4 text-xs text-bm-muted2/80">
          <summary className="cursor-pointer">Diagnostics</summary>
          <p className="mt-1">Request ID: {props.requestId}</p>
        </details>
      ) : null}
    </div>
  );
}

export default OperatorUnavailableState;
