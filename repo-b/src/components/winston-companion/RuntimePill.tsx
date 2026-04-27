"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import {
  resolveRuntime,
  setRuntime,
  subscribeRuntime,
  type WinstonRuntime,
} from "@/lib/winston-companion/runtimeRouter";

/**
 * Runtime selector pill mounted in the Winston drawer + workspace headers.
 *
 * Naming discipline: surfaces only "Winston" and "Operator" — never "Claude"
 * or "Anthropic" in primary chat UI per the plan. Underlying runtime ids
 * remain `gateway` / `managed_agent`.
 *
 * The third "Auto" segment is hidden until both sides of the auto-router
 * are wired (server-side `WINSTON_AUTO_ROUTER_ENABLED` AND client-side
 * `runtimeRouter.isOperatorActive` widening). Showing it before then would
 * imply behavior that isn't there.
 */
export default function RuntimePill({
  className,
  showAuto = false,
}: {
  className?: string;
  showAuto?: boolean;
}) {
  const [runtime, setRuntimeState] = useState<WinstonRuntime>("gateway");

  useEffect(() => {
    setRuntimeState(resolveRuntime());
    return subscribeRuntime((next) => setRuntimeState(next));
  }, []);

  const handleSwitch = (next: WinstonRuntime) => {
    if (next === runtime) return;
    setRuntime(next);
    setRuntimeState(next);
  };

  return (
    <div
      role="tablist"
      aria-label="Winston runtime"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-bm-border/40 bg-bm-surface/30 p-0.5 text-[11px]",
        className,
      )}
      data-testid="winston-runtime-pill"
    >
      <Segment
        active={runtime === "gateway"}
        label="Winston"
        tone="neutral"
        onClick={() => handleSwitch("gateway")}
      />
      <Segment
        active={runtime === "managed_agent"}
        label="Operator"
        tone="amber"
        title="Tool-running agent — confirms each action"
        onClick={() => handleSwitch("managed_agent")}
      />
      {showAuto ? (
        <Segment
          active={runtime === "auto"}
          label="Auto"
          tone="violet"
          title="Auto-routing (experimental)"
          onClick={() => handleSwitch("auto")}
        />
      ) : null}
    </div>
  );
}

function Segment({
  active,
  label,
  tone,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  tone: "neutral" | "amber" | "violet";
  title?: string;
  onClick: () => void;
}) {
  const toneClasses =
    tone === "amber"
      ? active
        ? "bg-amber-500/20 text-amber-200 border border-amber-500/40"
        : "text-amber-300/70 hover:text-amber-200"
      : tone === "violet"
        ? active
          ? "bg-violet-500/20 text-violet-200 border border-violet-500/40"
          : "text-violet-300/70 hover:text-violet-200"
        : active
          ? "bg-bm-accent/20 text-bm-text border border-bm-accent/40"
          : "text-bm-muted hover:text-bm-text";

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-0.5 font-medium transition-colors",
        toneClasses,
      )}
    >
      {label}
    </button>
  );
}
