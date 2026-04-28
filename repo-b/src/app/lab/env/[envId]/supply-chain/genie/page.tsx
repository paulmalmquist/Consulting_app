import GenieDemoPanel from "@/components/supply-chain/GenieDemoPanel";
import NotebookCallout from "@/components/supply-chain/NotebookCallout";
import { PageHeader } from "@/components/supply-chain/primitives";

interface Props {
  params: Promise<{ envId: string }>;
}

export default async function GeniePage({ params }: Props) {
  const { envId } = await params;
  return (
    <>
      <PageHeader
        eyebrow="Genie · Natural-Language BI"
        title="Ask the lakehouse a question"
        blurb="Natural-language access grounded on certified Gold tables. Demo answers are deterministic for now; the production version uses the metric registry as the source of truth for definitions."
      />
      <GenieDemoPanel />
      <NotebookCallout pageSlug="genie" envId={envId} />
    </>
  );
}
