type VisualProps = {
  className?: string;
};

export function GovernanceGateDiagram({ className }: VisualProps) {
  return (
    <svg className={className} viewBox="0 0 760 260" role="img" aria-label="Governance gate diagram">
      <rect width="760" height="260" rx="12" fill="rgb(var(--nv-surface-raised))" />
      <g fill="none" stroke="rgb(var(--nv-text-primary) / 0.12)">
        <path d="M80 130h600" />
        <path d="M230 62v136M380 62v136M530 62v136" />
      </g>
      {[
        ["Data in", 82, "Sources"],
        ["Boundary", 232, "Access rules"],
        ["Audit", 382, "Evidence"],
        ["Fail closed", 532, "Null reason"],
        ["Result out", 642, "Reviewed"],
      ].map(([title, x, detail]) => (
        <g key={title}>
          <rect x={Number(x) - 58} y="82" width="116" height="96" rx="8" fill="rgb(var(--nv-bg) / 0.64)" stroke="rgb(var(--nv-accent-teal) / 0.32)" />
          <circle cx={x} cy="112" r="12" fill="rgb(var(--nv-accent-teal) / 0.16)" stroke="rgb(var(--nv-accent-teal) / 0.7)" />
          <text x={x} y="142" textAnchor="middle" fill="rgb(var(--nv-text-primary))" fontSize="14">{title}</text>
          <text x={x} y="162" textAnchor="middle" fill="rgb(var(--nv-text-tertiary))" fontSize="11">{detail}</text>
        </g>
      ))}
    </svg>
  );
}

export function BaselineTargetBar({ className }: VisualProps) {
  return (
    <svg className={className} viewBox="0 0 760 250" role="img" aria-label="Baseline to target bar">
      <rect width="760" height="250" rx="12" fill="rgb(var(--nv-surface-raised))" />
      <text x="40" y="48" fill="rgb(var(--nv-text-primary))" fontSize="18">Same freed hour, different reach</text>
      <g transform="translate(40 86)">
        <text x="0" y="18" fill="rgb(var(--nv-text-tertiary))" fontSize="13">Salary slice</text>
        <rect x="190" y="0" width="128" height="28" rx="4" fill="rgb(var(--nv-text-primary) / 0.14)" />
        <text x="334" y="19" fill="rgb(var(--nv-text-secondary))" fontSize="12">1.0x</text>
      </g>
      <g transform="translate(40 136)">
        <text x="0" y="18" fill="rgb(var(--nv-text-tertiary))" fontSize="13">Team packet</text>
        <rect x="190" y="0" width="260" height="28" rx="4" fill="rgb(var(--nv-accent-teal) / 0.36)" />
        <text x="466" y="19" fill="rgb(var(--nv-text-secondary))" fontSize="12">2.0x+</text>
      </g>
      <g transform="translate(40 186)">
        <text x="0" y="18" fill="rgb(var(--nv-text-tertiary))" fontSize="13">Board decision</text>
        <rect x="190" y="0" width="470" height="28" rx="4" fill="rgb(var(--nv-accent-copper) / 0.42)" />
        <text x="676" y="19" fill="rgb(var(--nv-text-secondary))" fontSize="12">8.0x+</text>
      </g>
    </svg>
  );
}

export function RoiScoreboardMock({ className }: VisualProps) {
  return (
    <svg className={className} viewBox="0 0 760 300" role="img" aria-label="ROI scoreboard mock">
      <rect width="760" height="300" rx="12" fill="rgb(var(--nv-surface-raised))" />
      <text x="36" y="46" fill="rgb(var(--nv-text-primary))" fontSize="18">Scoreboard format</text>
      {[
        ["Workflow", "Modeled", "Realized", "Delta"],
        ["Board packet", "$77k", "$62k", "Pending"],
        ["Renewal report", "$44k", "$39k", "-$5k"],
        ["Client response", "$128k", "Pilot", "Open"],
      ].map((row, rowIndex) => (
        <g key={row.join("-")} transform={`translate(36 ${76 + rowIndex * 46})`}>
          <rect width="688" height="34" rx="4" fill={rowIndex === 0 ? "rgb(var(--nv-bg) / 0.72)" : "rgb(var(--nv-bg) / 0.38)"} />
          {row.map((cell, index) => (
            <text
              key={cell}
              x={[18, 300, 444, 586][index]}
              y="22"
              fill={rowIndex === 0 ? "rgb(var(--nv-text-tertiary))" : "rgb(var(--nv-text-secondary))"}
              fontSize="12"
            >
              {cell}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function DecisionLatencyTimeline({ className }: VisualProps) {
  return (
    <svg className={className} viewBox="0 0 760 250" role="img" aria-label="Decision latency timeline">
      <rect width="760" height="250" rx="12" fill="rgb(var(--nv-surface-raised))" />
      <text x="40" y="46" fill="rgb(var(--nv-text-primary))" fontSize="18">Decision wait becomes measurable</text>
      <path d="M80 130h600" stroke="rgb(var(--nv-text-primary) / 0.14)" />
      {[
        ["Request", 96],
        ["Context", 246],
        ["Review", 396],
        ["Decision", 546],
        ["Record", 674],
      ].map(([label, x], index) => (
        <g key={label}>
          <circle cx={x} cy="130" r="15" fill={index === 2 ? "rgb(var(--nv-amber) / 0.24)" : "rgb(var(--nv-accent-teal) / 0.18)"} stroke="rgb(var(--nv-accent-teal) / 0.66)" />
          <text x={x} y="174" textAnchor="middle" fill="rgb(var(--nv-text-secondary))" fontSize="12">{label}</text>
        </g>
      ))}
      <path d="M246 102h150" stroke="rgb(var(--nv-amber) / 0.8)" strokeDasharray="5 5" />
      <text x="320" y="92" textAnchor="middle" fill="rgb(var(--nv-amber))" fontSize="12">wait time</text>
    </svg>
  );
}

