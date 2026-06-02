import type { Metadata } from "next";
import { HeroBackground } from "@/components/marketing/HeroBackground";
import { RoiCalculator } from "@/components/marketing/aiRoi/RoiCalculator";
import {
  BaselineTargetBar,
  GovernanceGateDiagram,
  RoiScoreboardMock,
} from "@/components/marketing/aiRoi/visuals/AiRoiVisuals";
import { NvButton } from "@/components/marketing/ui/NvButton";
import { NvCard } from "@/components/marketing/ui/NvCard";
import { PageHeader } from "@/components/marketing/ui/PageHeader";

export const metadata: Metadata = {
  title: "AI ROI | Novendor",
  description:
    "A practical AI ROI reframing exercise and assessment path for teams that need to see where AI time savings matter most.",
  alternates: { canonical: "/ai-roi" },
  openGraph: {
    title: "AI ROI | Novendor",
    description:
      "A practical AI ROI reframing exercise and assessment path for teams that need to see where AI time savings matter most.",
    url: "https://www.novendor.ai/ai-roi",
    type: "website",
  },
};

const MEASURES = [
  "Manual assembly time",
  "Decision wait",
  "Reporting breaks",
  "AI spend with no scoreboard",
  "Governance readiness",
];

const METHOD = [
  "Baseline the workflow",
  "Map who consumes the output",
  "Rank the highest-value AI targets",
  "Set the control gate before rollout",
];

export default function AiRoiPage() {
  return (
    <>
      <HeroBackground overlayOpacity={0.58}>
        <div className="nv-hero">
          <PageHeader
            eyebrow="AI ROI"
            headline={<>Same salary. Different <em>AI</em> value.</>}
            lede="The exercise reframes AI value around what a person produces and who consumes it. A freed hour in one role is not the same as a freed hour in another."
          >
            <div className="mt-7 flex flex-wrap gap-3">
              <NvButton variant="primary" href="/ai-roi/calculator">Try the reframing exercise</NvButton>
              <NvButton variant="ghost" href="/ai-roi/assessment">Scope an assessment</NvButton>
            </div>
          </PageHeader>
          <div className="nv-hero-panel">
            <div className="line"><span className="k">Model type</span><span className="v">Illustrative</span></div>
            <div className="line"><span className="k">Main input</span><span className="v">Freed hours</span></div>
            <div className="line"><span className="k">Multiplier</span><span className="v">Role x audience x output</span></div>
            <div className="line"><span className="k">Use</span><span className="v">Teaching tool, not quote</span></div>
          </div>
        </div>
      </HeroBackground>

      <div className="nv-page nv-page--wide" style={{ paddingTop: 0 }}>
        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow">The problem</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <NvCard>
              <h2 className="nv-h3" style={{ marginBottom: 10 }}>AI spend has outpaced measurement.</h2>
              <p className="nv-body" style={{ margin: 0 }}>
                Seats get bought, tools get tried, and the renewal question arrives before the company can show what changed.
                The missing piece is a scoreboard tied to real workflows.
              </p>
            </NvCard>
            <BaselineTargetBar />
          </div>
        </section>

        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow">What we measure</p>
          </div>
          <div className="grid gap-4 md:grid-cols-5">
            {MEASURES.map((item) => (
              <NvCard key={item}>
                <p className="nv-body" style={{ margin: 0 }}>{item}</p>
              </NvCard>
            ))}
          </div>
        </section>

        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow">The method</p>
            <p className="nv-small" style={{ margin: 0 }}>Assessment in four steps</p>
          </div>
          <div className="grid gap-6 md:grid-cols-4">
            {METHOD.map((item, index) => (
              <NvCard key={item}>
                <p className="nv-eyebrow" style={{ marginBottom: 12 }}>{String(index + 1).padStart(2, "0")}</p>
                <h3 className="nv-h3">{item}</h3>
              </NvCard>
            ))}
          </div>
        </section>

        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow">Governance gate</p>
          </div>
          <GovernanceGateDiagram />
        </section>

        <section className="nv-section">
          <div className="nv-section-head">
            <p className="nv-eyebrow">Proof format</p>
            <NvButton variant="ghost" href="/ai-roi/case-studies">View case study template</NvButton>
          </div>
          <RoiScoreboardMock />
        </section>

        <section className="nv-section" id="calculator">
          <div className="nv-section-head">
            <p className="nv-eyebrow">ROI reframing exercise</p>
            <p className="nv-small" style={{ margin: 0 }}>Illustrative model. Not a quote.</p>
          </div>
          <RoiCalculator />
        </section>

        <section className="nv-section">
          <NvCard>
            <h2 className="nv-h3" style={{ marginBottom: 12 }}>Start with the work that has an audience.</h2>
            <p className="nv-body">
              The best AI target is rarely the task with the most minutes. It is the output that reaches the most
              people, feeds the largest decision, or changes the customer conversation.
            </p>
            <div className="flex flex-wrap gap-3" style={{ marginTop: 24 }}>
              <NvButton variant="primary" href="/ai-roi/assessment">Start the assessment</NvButton>
              <NvButton variant="ghost" href="/ai-roi/resources">Download the framework</NvButton>
            </div>
          </NvCard>
        </section>
      </div>
    </>
  );
}

