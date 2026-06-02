import type { Metadata } from "next";
import { RoiScoreboardMock } from "@/components/marketing/aiRoi/visuals/AiRoiVisuals";
import { NvCard } from "@/components/marketing/ui/NvCard";
import { PageHeader } from "@/components/marketing/ui/PageHeader";

export const metadata: Metadata = {
  title: "AI ROI Case Studies | Novendor",
  description: "The proof format Novendor uses to separate modeled AI gains from realized gains.",
  alternates: { canonical: "/ai-roi/case-studies" },
};

export default function AiRoiCaseStudiesPage() {
  return (
    <div className="nv-page nv-page--wide">
      <PageHeader
        eyebrow="Case studies"
        headline={<>Modeled and realized gains stay separate.</>}
        lede="This page will hold client-ready proof once a pilot has been measured. For now, it shows the reporting format."
      />

      <section className="nv-section">
        <RoiScoreboardMock />
      </section>

      <section className="nv-section">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            ["Situation", "What workflow was measured and why it mattered."],
            ["Intervention", "What AI changed, with the governance gate named."],
            ["Result", "Modeled gain, realized gain, and the reason for any gap."],
          ].map(([title, detail]) => (
            <NvCard key={title}>
              <h2 className="nv-h3">{title}</h2>
              <p className="nv-body" style={{ marginTop: 10 }}>{detail}</p>
            </NvCard>
          ))}
        </div>
      </section>
    </div>
  );
}

