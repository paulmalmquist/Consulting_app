"use client";

const STARTERS = [
  "What's Paul's background?",
  "Show me his skills breakdown",
  "What has he built?",
  "How long was he at Kayne Anderson?",
];

export default function ResumeStarterPrompts({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <p className="mb-3 text-sm text-bm-muted2">
        Ask about Paul&apos;s experience...
      </p>
      <div className="flex flex-wrap gap-2">
        {STARTERS.map((s) => (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className="rounded-full border border-bm-border/70 px-3 py-1.5 text-xs text-bm-muted hover:border-sky-500/50 hover:text-sky-400 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
