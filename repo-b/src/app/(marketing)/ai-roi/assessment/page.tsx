import type { Metadata } from "next";
import { DiscoveryQuestionnaire } from "@/components/marketing/aiRoi/DiscoveryQuestionnaire";
import { GovernanceGateDiagram } from "@/components/marketing/aiRoi/visuals/AiRoiVisuals";
import { NvCard } from "@/components/marketing/ui/NvCard";
import { PageHeader } from "@/components/marketing/ui/PageHeader";

export const metadata: Metadata = {
  title: "AI ROI Assessment | Novendor",
  description: "A scoped diagnostic for measuring where AI can add value inside real workflows.",
  alternates: { canonical: "/ai-roi/assessment" },
};

export default function AiRoiAssessmentPage() {
  return (
    <div className="nv-page nv-page--wide">
      <PageHeader
        eyebrow="AI ROI Assessment"
        headline={<>Find the workflows where AI time savings matter.</>}
        lede="The entry assessment maps current work, scores measurement gaps, and identifies the first workflows worth testing."
      />

      <section className="nv-section">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            ["Baseline", "Measure how work moves today."],
            ["Rank", "Compare value by role, audience, and output."],
            ["Control", "Define what AI can read, write, and cite."],
          ].map(([title, detail]) => (
            <NvCard key={title}>
              <h2 className="nv-h3">{title}</h2>
              <p className="nv-body" style={{ marginTop: 10 }}>{detail}</p>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow">Discovery questionnaire</p>
        </div>
        <DiscoveryQuestionnaire />
      </section>

      <section className="nv-section">
        <GovernanceGateDiagram />
      </section>
    </div>
  );
}

