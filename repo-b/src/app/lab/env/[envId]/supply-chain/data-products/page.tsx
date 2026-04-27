import DataProductsPanel from "@/components/supply-chain/DataProductsPanel";
import { PageHeader } from "@/components/supply-chain/primitives";

export default function DataProductsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Data Products"
        title="Certified supply chain data products"
        blurb="Each data product has a business owner, an SLA, certified metric definitions, and a known set of consumers. Nothing ships to Genie or BI before it earns the certified badge."
      />
      <DataProductsPanel />
    </>
  );
}
