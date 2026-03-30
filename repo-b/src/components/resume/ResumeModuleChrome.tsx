"use client";

import type { ReactNode } from "react";

export default function ResumeModuleChrome({
  eyebrow,
  title,
  subtitle,
  controls,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-bm-border/60 bg-bm-surface/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="bm-section-label">{eyebrow}</p>
          <h2 className="mt-2 text-2xl">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-bm-muted">{subtitle}</p>
        </div>
        {controls ? <div className="flex items-center gap-2">{controls}</div> : null}
      </div>
      {children}
    </section>
  );
}
