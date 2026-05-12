import { EvidenceStatusBadge } from "./EvidenceStatusBadge";
import type { ProofArtifact } from "./evidenceGraphData";

export function ProofArtifactCard({ artifact }: { artifact: ProofArtifact }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3
          className="text-[14px] font-semibold leading-snug"
          style={{ color: "var(--ros-text-bright)" }}
        >
          {artifact.title}
        </h3>
        <EvidenceStatusBadge status={artifact.status} size="xs" />
      </div>
      <p className="mt-2 text-[12px] leading-[1.6]" style={{ color: "var(--ros-text-muted)" }}>
        {artifact.summary}
      </p>
      {artifact.href && (
        <p
          className="mt-3 text-[10px] font-semibold tracking-[0.18em] uppercase"
          style={{ color: "var(--ros-accent-gold)" }}
        >
          Open →
        </p>
      )}
    </>
  );

  const className = "block rounded-lg border p-4 transition-colors";
  const style = {
    borderColor: "var(--ros-border)",
    background: "rgba(255,255,255,0.01)",
  };

  if (artifact.href) {
    return (
      <a href={artifact.href} className={className + " hover:bg-white/[0.02]"} style={style}>
        {body}
      </a>
    );
  }
  return (
    <div className={className} style={style}>
      {body}
    </div>
  );
}
