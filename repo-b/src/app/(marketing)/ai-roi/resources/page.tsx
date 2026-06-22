import type { Metadata } from "next";
import { ResourceDownloads } from "@/components/marketing/aiRoi/ResourceDownloads";
import { DecisionLatencyTimeline } from "@/components/marketing/aiRoi/visuals/AiRoiVisuals";
import { PageHeader } from "@/components/marketing/ui/PageHeader";

export const metadata: Metadata = {
  title: "AI ROI Resources | Novendor",
  description: "Download the AI ROI reframing and assessment framework one-pagers.",
  alternates: { canonical: "/ai-roi/resources" },
};

export default function AiRoiResourcesPage() {
  return (
    <div className="nv-page nv-page--wide">
      <PageHeader
        eyebrow="Resources"
        headline={<>Take the framework into the room.</>}
        lede="Download the one-pagers for the reframing exercise and assessment scope."
      />
      <section className="nv-section">
        <ResourceDownloads />
      </section>
      <section className="nv-section">
        <DecisionLatencyTimeline />
      </section>
    </div>
  );
}

