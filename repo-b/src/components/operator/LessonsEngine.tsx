"use client";

import { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { getOperatorLessons, OperatorLessonsBoard, OperatorLessonRow } from "@/lib/bos-api";

const SEVERITY_TONE: Record<string, string> = {
  high: "border-red-500/40 bg-red-500/15 text-red-400",
  medium: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  low: "border-bm-border/50 bg-white/5 text-bm-muted2",
};

function label(s: string): string {
  return s.replace(/_/g, " ");
}

export function LessonsEngine() {
  const { envId, businessId } = useDomainEnv();
  const [board, setBoard] = useState<OperatorLessonsBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getOperatorLessons(envId, businessId || undefined);
        if (!cancelled) setBoard(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load lessons.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envId, businessId]);

  if (loading) return <p className="text-sm text-bm-muted2">Loading lessons…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!board) return null;

  const { totals } = board;
  const applies = board.rows.filter((r) => r.applies_to_active_work);
  const reference = board.rows.filter((r) => !r.applies_to_active_work);

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border border-bm-border/60 bg-black/30 p-4"
        data-testid="lessons-headline"
      >
        <p className="text-sm text-bm-text">
          {totals.applies_count > 0 ? (
            <>
              <span className="font-semibold text-amber-300">
                {totals.applies_count} of {totals.lesson_count} lessons
              </span>{" "}
              apply to active themes. Preemptive actions listed below.
            </>
          ) : (
            <>{totals.lesson_count} historical lessons tracked — none match active themes.</>
          )}
        </p>
      </div>

      {applies.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
            Applies to active work
          </p>
          {applies.map((l) => (
            <LessonCard key={l.id} lesson={l} highlight />
          ))}
        </div>
      )}

      {reference.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Reference library
          </p>
          {reference.map((l) => (
            <LessonCard key={l.id} lesson={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function LessonCard({ lesson: l, highlight = false }: { lesson: OperatorLessonRow; highlight?: boolean }) {
  return (
    <div
      data-testid={`lesson-${l.id}`}
      className={`rounded-2xl border p-4 ${
        highlight ? "border-amber-500/30 bg-amber-500/5" : "border-bm-border/60 bg-black/20"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-bm-text">{l.project_name}</p>
          <p className="text-xs text-bm-muted2">
            {label(l.theme)}
            {l.municipality_is_active && " · active municipality"}
          </p>
        </div>
        <span
          data-testid={`lesson-severity-${l.id}`}
          className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${SEVERITY_TONE[l.severity]}`}
        >
          {l.severity}
        </span>
      </div>
      <p className="mt-2 text-sm text-bm-text">{l.lesson}</p>
      <div className="mt-2 rounded-xl border border-bm-border/40 bg-black/30 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-bm-muted2">
          Preemptive action
        </p>
        <p className="mt-1 text-sm text-bm-text">{l.preemptive_action}</p>
      </div>
    </div>
  );
}

export default LessonsEngine;
