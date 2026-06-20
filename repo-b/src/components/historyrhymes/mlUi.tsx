"use client";

/**
 * Shared dark-palette primitives for the ML Algorithm Decision Lab.
 *
 * The lab is a standalone, full-bleed dark surface (never wrapped in a shared
 * app/domain shell). Tailwind neutral palette, matching the other History
 * Rhymes pages (neutral-950/900/800).
 */

import * as React from "react";
import { Check, Copy } from "lucide-react";

export function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-neutral-900 border border-neutral-800 rounded-lg p-4 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-3">
          {title ? (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {title}
            </h3>
          ) : (
            <span />
          )}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "emerald" | "amber" | "red" | "sky" | "violet";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-neutral-800 text-neutral-300 border-neutral-700",
    emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    amber: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    red: "bg-red-500/20 text-red-300 border-red-500/40",
    sky: "bg-sky-500/20 text-sky-300 border-sky-500/40",
    violet: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  };
  return (
    <span className={`inline-block text-[10px] px-2 py-0.5 rounded border ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="bg-neutral-950/60 border border-neutral-800 rounded-md p-3">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-lg font-semibold text-neutral-100 mt-0.5">{value}</div>
      {sub ? <div className="text-[11px] text-neutral-500 mt-0.5">{sub}</div> : null}
    </div>
  );
}

/** 0-3 ordinal rendered as filled dots (for fit-score dimensions). */
export function DotScale({ value, max = 3 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} of ${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            i < value ? "bg-sky-400" : "bg-neutral-700"
          }`}
        />
      ))}
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[10px] text-neutral-400 hover:text-sky-300"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="text-sm text-neutral-500 py-8 text-center">{label}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md p-3">
      {message}
    </div>
  );
}

export function fmt(value: number | null | undefined, digits = 3): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}
