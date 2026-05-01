import type { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow: string;
  headline: ReactNode;
  lede?: string;
  children?: ReactNode;
};

export function PageHeader({ eyebrow, headline, lede, children }: PageHeaderProps) {
  return (
    <div>
      <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />{eyebrow}</p>
      <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: lede ? 24 : 0 }}>{headline}</h1>
      {lede && <p className="nv-lede">{lede}</p>}
      {children}
    </div>
  );
}
