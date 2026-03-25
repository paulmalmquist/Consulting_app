"use client";

import { cn } from "@/lib/cn";
import type { DrawStatus } from "@/types/capital-projects";

interface ApprovalWorkflowProps {
  status: DrawStatus;
  onSubmit?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onRequestRevision?: () => void;
  onSubmitToLender?: () => void;
  onMarkFunded?: () => void;
  onGenerateG702?: () => void;
  loading?: string | null;
}

export function ApprovalWorkflow({
  status,
  onSubmit,
  onApprove,
  onReject,
  onRequestRevision,
  onSubmitToLender,
  onMarkFunded,
  onGenerateG702,
  loading,
}: ApprovalWorkflowProps) {
  const btn = (label: string, action: string, onClick?: () => void, color = "bm-accent") => {
    if (!onClick) return null;
    const colorMap: Record<string, string> = {
      "bm-accent": "border-bm-accent/40 bg-bm-accent/10 text-bm-accent hover:bg-bm-accent/20",
      emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
      amber: "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
      orange: "border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20",
      rose: "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20",
      blue: "border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20",
      cyan: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20",
    };

    return (
      <button
        onClick={onClick}
        disabled={!!loading}
        className={cn("rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50", colorMap[color])}
      >
        {loading === action ? `${label}...` : label}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && btn("Submit for Review", "submit", onSubmit, "amber")}
      {status === "pending_review" && (
        <>
          {btn("Approve", "approve", onApprove, "emerald")}
          {btn("Request Revision", "revision", onRequestRevision, "orange")}
          {btn("Reject", "reject", onReject, "rose")}
        </>
      )}
      {status === "revision_requested" && btn("Resubmit", "submit", onSubmit, "amber")}
      {status === "approved" && (
        <>
          {btn("Generate G702/G703", "g702", onGenerateG702, "bm-accent")}
          {btn("Submit to Lender", "lender", onSubmitToLender, "blue")}
        </>
      )}
      {status === "submitted_to_lender" && btn("Mark as Funded", "funded", onMarkFunded, "cyan")}
    </div>
  );
}
