import type { ReactNode } from 'react';

type SectionHeaderProps = {
  eyebrow?: string;
  headline: ReactNode;
  description?: string;
};

export function SectionHeader({ eyebrow, headline, description }: SectionHeaderProps) {
  return (
    <div className="nv-section-head">
      {eyebrow && <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />{eyebrow}</p>}
      <h2 className="nv-h2">{headline}</h2>
      {description && <p className="nv-body" style={{ marginTop: 8 }}>{description}</p>}
    </div>
  );
}
