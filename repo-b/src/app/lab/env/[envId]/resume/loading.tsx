import ResumeFallbackCard from "@/components/resume/ResumeFallbackCard";

export default function Loading() {
  return (
    <div className="space-y-6">
      <ResumeFallbackCard
        eyebrow="Visual Resume"
        title="Initializing visual resume"
        body="Loading the profile, timeline, architecture, modeling, and analytics layers for this environment."
        className="min-h-[220px]"
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="h-[420px] animate-pulse rounded-[28px] border border-bm-border/50 bg-white/5" />
          <div className="h-[320px] animate-pulse rounded-[28px] border border-bm-border/50 bg-white/5" />
        </div>
        <div className="space-y-6">
          <div className="h-[280px] animate-pulse rounded-[28px] border border-bm-border/50 bg-white/5" />
          <div className="h-[320px] animate-pulse rounded-[28px] border border-bm-border/50 bg-white/5" />
        </div>
      </div>
    </div>
  );
}
