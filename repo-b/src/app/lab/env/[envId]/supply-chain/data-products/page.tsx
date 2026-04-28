import DataProductsPanel from "@/components/supply-chain/DataProductsPanel";
import NotebookCallout from "@/components/supply-chain/NotebookCallout";
import { PageHeader } from "@/components/supply-chain/primitives";

interface Props {
  params: Promise<{ envId: string }>;
}

export default async function DataProductsPage({ params }: Props) {
  const { envId } = await params;
  return (
    <>
      <PageHeader
        eyebrow="Data Products"
        title="Certified supply chain data products"
        blurb="Each data product has a business owner, an SLA, certified metric definitions, and a known set of consumers. Nothing ships to Genie or BI before it earns the certified badge."
      />
      <DataProductsPanel />
      <NotebookCallout pageSlug="data-products" envId={envId} />
    </>
  );
}
