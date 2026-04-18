"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Zap } from "lucide-react";

export type TopControlBarProps = {
  statusCounts: { synced: number; needsAction: number; overdue: number };
  onUpload: (files: File[]) => Promise<void> | void;
  onDetectRecurring: () => Promise<void> | void;
};

function LiveClock() {
  const [now, setNow] = useState<string>(() => new Date().toISOString().slice(11, 19));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString().slice(11, 19)), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{now} UTC</span>;
}

export default function TopControlBar({ statusCounts, onUpload, onDetectRecurring }: TopControlBarProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const triggerUpload = () => fileRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    await onUpload(Array.from(files));
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <header
      className="flex h-[52px] flex-none items-center justify-between border-b border-slate-800 bg-slate-950 px-4"
      data-testid="accounting-top-bar"
    >
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-400">
          NOVENDOR · ACCOUNTING
        </span>
        <span className="h-5 w-px bg-slate-700" />
        <h1 className="text-sm font-semibold text-slate-100">Command Desk</h1>
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
        <span className="hidden text-[11px] text-slate-500 md:inline">
          live · receipt intake · subscription ledger
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-slate-400 md:flex">
          <span>
            synced <span className="text-emerald-400">{statusCounts.synced}</span>
          </span>
          <span>
            needs <span className="text-amber-400">{statusCounts.needsAction}</span>
          </span>
          <span>
            overdue <span className="text-rose-400">{statusCounts.overdue}</span>
          </span>
        </div>
        <LiveClock />
        <button
          type="button"
          onClick={() => void onDetectRecurring()}
          className="inline-flex items-center gap-1.5 rounded-md border border-violet-400/40 bg-slate-900 px-3 py-1 text-[11px] text-violet-300 transition hover:border-violet-300 hover:text-violet-100"
          data-testid="detect-recurring-button"
        >
          <Zap size={12} /> Detect recurring
        </button>
        <button
          type="button"
          onClick={triggerUpload}
          className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/40 bg-slate-900 px-3 py-1 text-[11px] uppercase tracking-widest text-cyan-300 transition hover:border-cyan-300 hover:text-cyan-100"
          data-testid="upload-receipt-button"
        >
          <Upload size={12} /> Upload receipt
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          multiple
          className="hidden"
          data-testid="upload-receipt-input"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>
    </header>
  );
}
