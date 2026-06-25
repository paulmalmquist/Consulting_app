// The telemetry mount of ADE is superseded by the composed Data Engineering section under
// /telemetry/data-engineering. Every page in this segment now redirects there, so this layout no
// longer wraps anything in AdeShell — it just passes children through (the redirect short-circuits
// the render). The portable AdeShell component is unchanged and still available for a future
// standalone mount in another environment. See ADR 0002 follow-up.
export default function AdeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
