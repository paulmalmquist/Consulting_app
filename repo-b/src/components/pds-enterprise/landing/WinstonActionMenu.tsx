export function WinstonActionMenu({ onAction }: { onAction?: (action: string) => void }) {
  const actions = [
    "Summarize situation",
    "Draft next steps",
    "Draft outreach",
    "Launch deeper research",
    "Open workspace",
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => onAction?.(action)}
          className="rounded-lg border border-bm-border/60 bg-bm-surface/10 px-2.5 py-1 text-[11px] font-medium text-bm-muted2 hover:text-bm-text"
        >
          {action}
        </button>
      ))}
    </div>
  );
}
