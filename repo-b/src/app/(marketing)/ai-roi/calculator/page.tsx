import type { Metadata } from "next";
import { RoiCalculator } from "@/components/marketing/aiRoi/RoiCalculator";
import { BaselineTargetBar } from "@/components/marketing/aiRoi/visuals/AiRoiVisuals";
import { PageHeader } from "@/components/marketing/ui/PageHeader";

export const metadata: Metadata = {
  title: "AI ROI Calculator | Novendor",
  description: "An illustrative ROI reframing exercise for comparing the value of freed hours across roles.",
  alternates: { canonical: "/ai-roi/calculator" },
};

export default function AiRoiCalculatorPage() {
  return (
    <div className="nv-page nv-page--wide">
      <PageHeader
        eyebrow="ROI reframing exercise"
        headline={<>A freed hour is not always worth the same amount.</>}
        lede="Pick a role, audience, and output. The model shows how the same time savings can carry different business value."
      />
      <section className="nv-section">
        <RoiCalculator />
      </section>
      <section className="nv-section">
        <BaselineTargetBar />
      </section>
    </div>
  );
}

