import PipelineInventory from "@/components/supply-chain/PipelineInventory";
import NotebookCallout from "@/components/supply-chain/NotebookCallout";
import { PageHeader } from "@/components/supply-chain/primitives";

interface Props {
  params: Promise<{ envId: string }>;
}

export default async function MedallionPage({ params }: Props) {
  const { envId } = await params;
  return (
    <>
      <PageHeader
        eyebrow="Medallion Pipelines"
        title="Bronze · Silver · Gold inventory"
        blurb="Every Delta Live Tables pipeline grouped by layer, with row counts, last run status, owners, and the DLT expectations enforced at write time."
      />
      <PipelineInventory />
      <NotebookCallout pageSlug="medallion" envId={envId} />
    </>
  );
}
