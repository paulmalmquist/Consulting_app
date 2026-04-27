import RoadmapTimeline from "@/components/supply-chain/RoadmapTimeline";
import { PageHeader } from "@/components/supply-chain/primitives";

export default function RoadmapPage() {
  return (
    <>
      <PageHeader
        eyebrow="Delivery Roadmap"
        title="90-day plan"
        blurb="A sequenced, not aspirational, plan to land Bronze, Silver, Gold, governance, and the first ML pilots inside one quarter. Each phase calls out the risks we expect and how we mitigate them."
      />
      <RoadmapTimeline />
    </>
  );
}
