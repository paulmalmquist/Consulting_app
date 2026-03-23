import type { ReactNode } from "react";

interface Props {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function SectionHeader({ eyebrow, title, description, action }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-bm-text">{title}</h2>
      </div>
      {description ? <p className="max-w-2xl text-sm text-bm-muted2">{description}</p> : null}
      {action ?? null}
    </div>
  );
}
