type VisualPlaceholderProps = {
  title: string;
  description: string;
};

export function VisualPlaceholder({ title, description }: VisualPlaceholderProps) {
  return (
    <div className="rounded-3xl border border-nv-text/10 bg-nv-bg/40 p-6">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-nv-dim">
        <span>{title}</span>
        <span className="text-nv-teal">Placeholder</span>
      </div>
      <p className="mt-3 text-sm text-nv-dim">{description}</p>
      <div className="mt-5 space-y-3" aria-hidden="true">
        <div className="h-2 w-full rounded-full bg-nv-raised" />
        <div className="h-2 w-4/5 rounded-full bg-nv-raised" />
        <div className="h-2 w-3/5 rounded-full bg-nv-raised" />
        <div className="grid gap-3 pt-4 md:grid-cols-2">
          <div className="rounded-2xl border border-nv-text/10 bg-nv-surface/70 p-4">
            <div className="h-2 w-3/4 rounded-full bg-nv-raised" />
            <div className="mt-3 h-2 w-2/3 rounded-full bg-nv-raised" />
          </div>
          <div className="rounded-2xl border border-nv-text/10 bg-nv-surface/70 p-4">
            <div className="h-2 w-4/5 rounded-full bg-nv-raised" />
            <div className="mt-3 h-2 w-1/2 rounded-full bg-nv-raised" />
          </div>
        </div>
      </div>
    </div>
  );
}
