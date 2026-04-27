import SourceSystemsPanel from "@/components/supply-chain/SourceSystemsPanel";
import { PageHeader } from "@/components/supply-chain/primitives";

export default function SourceSystemsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Source Systems"
        title="Connected source systems"
        blurb="The systems we ingest from, the patterns we use, the entities we land, and the AI-assisted profiling output for each. Quality issues are tracked openly so the steward queue stays honest."
      />
      <SourceSystemsPanel />
    </>
  );
}
