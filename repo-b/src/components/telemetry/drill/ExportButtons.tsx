"use client";

import { C, TelemetryActionButton } from "../primitives";
import { downloadCsv } from "./exportCsv";

function DisabledReason({ reason }: { reason?: string | null }) {
  if (!reason) return null;
  return (
    <span style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint, lineHeight: 1.5 }}>
      {reason}
    </span>
  );
}

// CSV export of the exact rows/columns shown on screen (same filter context). Disabled —
// with a reason — when there are no rows, so it never produces an empty/fake file silently.
export function ExportToCsvButton({
  filename,
  columns,
  rows,
  label = "Export CSV",
  disabled,
  disabledReason,
}: {
  filename: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  label?: string;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const noRows = rows.length === 0;
  const isDisabled = Boolean(disabled) || noRows;
  const reason = isDisabled
    ? disabledReason ?? (noRows ? "No rows to export" : "Export unavailable")
    : null;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
      <TelemetryActionButton
        variant="secondary"
        disabled={isDisabled}
        onClick={() => downloadCsv(filename, columns, rows)}
        aria-label={`${label} (${rows.length} rows)`}
      >
        {label}
      </TelemetryActionButton>
      <DisabledReason reason={reason} />
    </span>
  );
}

// XLSX export via the server route. `url` is null when the tenant context is missing or
// the source has no server export, in which case the button is disabled with a reason.
export function ExportToExcelButton({
  url,
  label = "Export XLSX",
  disabled,
  disabledReason,
}: {
  url: string | null;
  label?: string;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const isDisabled = Boolean(disabled) || !url;
  const reason = isDisabled ? disabledReason ?? "Server export unavailable for this source" : null;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
      <TelemetryActionButton
        variant="secondary"
        disabled={isDisabled}
        onClick={() => {
          if (url) window.open(url, "_blank", "noopener,noreferrer");
        }}
        aria-label={label}
      >
        {label}
      </TelemetryActionButton>
      <DisabledReason reason={reason} />
    </span>
  );
}
