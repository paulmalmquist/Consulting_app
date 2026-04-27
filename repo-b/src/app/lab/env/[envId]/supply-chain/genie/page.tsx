import GenieDemoPanel from "@/components/supply-chain/GenieDemoPanel";
import { PageHeader } from "@/components/supply-chain/primitives";

export default function GeniePage() {
  return (
    <>
      <PageHeader
        eyebrow="Genie · Natural-Language BI"
        title="Ask the lakehouse a question"
        blurb="Natural-language access grounded on certified Gold tables. Demo answers are deterministic for now; the production version uses the metric registry as the source of truth for definitions."
      />
      <GenieDemoPanel />
    </>
  );
}
