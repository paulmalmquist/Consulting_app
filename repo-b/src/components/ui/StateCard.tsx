import * as React from "react";
import { cn } from "@/lib/cn";

type LoadingState = { state: "loading"; className?: string };
type EmptyState = {
  state: "empty";
  title: string;
  description?: string;
  illustration?: React.ReactNode;
  cta?: { label: string; onClick: () => void };
  className?: string;
};
type ErrorState = {
  state: "error";
  title: string;
  message: string;
  onRetry?: () => void;
  className?: string;
};

export type StateCardProps = LoadingState | EmptyState | ErrorState;

function ShimmerBar({ width }: { width: string }) {
  return (
    <div
      className={cn("h-3 rounded-md bg-bm-surface2/60 animate-pulse", width)}
    />
  );
}

export function StateCard(props: StateCardProps) {
  if (props.state === "loading") {
    return (
      <div
        className={cn(
          "rounded-xl border border-bm-border/50 bg-bm-surface/20 p-6 space-y-3",
          props.className
        )}
      >
        <ShimmerBar width="w-1/3" />
        <ShimmerBar width="w-2/3" />
        <ShimmerBar width="w-1/2" />
      </div>
    );
  }

  if (props.state === "empty") {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-bm-border/50 bg-bm-surface/10 p-8 text-center",
          props.className
        )}
      >
        {props.illustration && (
          <div className="mb-4 flex justify-center text-bm-muted2">
            {props.illustration}
          </div>
        )}
        <h3 className="text-base font-display font-semibold text-bm-text">
          {props.title}
        </h3>
        {props.description && (
          <p className="mt-1 text-sm text-bm-muted2">{props.description}</p>
        )}
        {props.cta && (
          <button
            type="button"
            onClick={props.cta.onClick}
            className="mt-4 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-bm-accentContrast transition-[transform,box-shadow] duration-[120ms] hover:-translate-y-[1px]"
          >
            {props.cta.label}
          </button>
        )}
      </div>
    );
  }

  // error state
  return (
    <div
      className={cn(
        "rounded-xl border border-bm-danger/40 bg-bm-danger/8 p-6",
        props.className
      )}
    >
      <h3 className="text-base font-semibold text-bm-text">{props.title}</h3>
      <p className="mt-1 text-sm text-bm-danger">{props.message}</p>
      {props.onRetry && (
        <button
          type="button"
          onClick={props.onRetry}
          className="mt-3 rounded-lg border border-bm-danger/40 px-3 py-1.5 text-sm font-medium text-bm-danger transition-[transform] duration-[120ms] hover:-translate-y-[1px]"
        >
          Retry
        </button>
      )}
    </div>
  );
}
