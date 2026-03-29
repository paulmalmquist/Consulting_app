import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "default" | "warning" | "error";

export default function ResumeFallbackCard({
  eyebrow = "Visual Resume",
  title,
  body,
  meta,
  action,
  tone = "default",
  className,
}: {
  eyebrow?: string;
  title: string;
  body: string;
  meta?: string | null;
  action?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const toneClasses =
    tone === "error"
      ? "border-red-400/20 bg-[radial-gradient(circle_at_top_right,rgba(248,113,113,0.14),transparent_36%),linear-gradient(180deg,rgba(127,29,29,0.18),rgba(15,23,42,0.25))]"
      : tone === "warning"
        ? "border-amber-400/20 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_36%),linear-gradient(180deg,rgba(120,53,15,0.12),rgba(15,23,42,0.25))]"
        : "border-bm-border/60 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))]";

  return (
    <section className={cn("rounded-[28px] border p-5 shadow-[0_24px_64px_-48px_rgba(5,12,18,0.85)]", toneClasses, className)}>
      <p className="bm-section-label">{eyebrow}</p>
      <h2 className="mt-2 text-xl text-bm-text">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-bm-muted">{body}</p>
      {meta ? <p className="mt-4 text-xs text-bm-muted2">{meta}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
