"use client";

import { Card, CardContent } from "@/components/ui/Card";

export function fmtCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(`1970-01-01T${value}`);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 5);
  return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function TonePill({ label, tone = "default" }: { label: string; tone?: "default" | "success" | "warning" | "danger" | "info" }) {
  const cls = {
    default: "bg-bm-surface/40 text-bm-text",
    success: "bg-bm-success/10 text-bm-success",
    warning: "bg-bm-warning/10 text-bm-warning",
    danger: "bg-bm-danger/10 text-bm-danger",
    info: "bg-bm-accent/10 text-bm-accent",
  }[tone];
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${cls}`}>{label}</span>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardContent className="py-6 text-center">
        <p className="text-sm font-medium text-bm-text">{title}</p>
        <p className="mt-1 text-sm text-bm-muted2">{body}</p>
      </CardContent>
    </Card>
  );
}
