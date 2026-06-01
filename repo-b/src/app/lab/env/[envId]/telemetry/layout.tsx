import type { CSSProperties } from "react";
import TelemetryShell from "@/components/telemetry/TelemetryShell";

// Force the dark engineering-console look regardless of the global light/dark toggle: pin the --bm-*
// token VALUES on the wrapper (the design charter requires internal operator surfaces to be dark).
// Matches the consulting/pipeline layout pattern.
const consoleTheme = {
  "--bm-bg": "213 29% 6%",
  "--bm-bg-2": "216 30% 5%",
  "--bm-surface": "213 25% 9%",
  "--bm-surface-2": "214 24% 12%",
  "--bm-border": "215 24% 16%",
  "--bm-border-strong": "215 18% 24%",
  "--bm-text": "213 41% 93%",
  "--bm-text-muted": "215 16% 57%",
  "--bm-text-muted-2": "215 13% 40%",
  "--bm-accent": "200 89% 60%",
  "--bm-accent-2": "200 89% 55%",
  "--bm-danger": "0 84% 60%",
  "--bm-warning": "43 96% 56%",
  "--bm-success": "160 84% 39%",
} as CSSProperties;

export default async function TelemetryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  return (
    <div data-theme="dark" style={consoleTheme} className="bg-bm-bg">
      <TelemetryShell envId={envId}>{children}</TelemetryShell>
    </div>
  );
}
