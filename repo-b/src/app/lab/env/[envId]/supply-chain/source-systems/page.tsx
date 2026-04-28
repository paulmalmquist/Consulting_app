import SourceSystemsPanel from "@/components/supply-chain/SourceSystemsPanel";
import NotebookCallout from "@/components/supply-chain/NotebookCallout";
import { PageHeader } from "@/components/supply-chain/primitives";

interface Props {
  params: Promise<{ envId: string }>;
}

export default async function SourceSystemsPage({ params }: Props) {
  const { envId } = await params;
  return (
    <>
      <PageHeader
        eyebrow="Source Systems"
        title="Connected source systems"
        blurb="The systems we ingest from, the patterns we use, the entities we land, and the AI-assisted profiling output for each. Quality issues are tracked openly so the steward queue stays honest."
      />
      <SourceSystemsPanel />
      <NotebookCallout pageSlug="source-systems" envId={envId} />
    </>
  );
}
