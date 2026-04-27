import PipelineInventory from "@/components/supply-chain/PipelineInventory";
import { PageHeader } from "@/components/supply-chain/primitives";

export default function MedallionPage() {
  return (
    <>
      <PageHeader
        eyebrow="Medallion Pipelines"
        title="Bronze · Silver · Gold inventory"
        blurb="Every Delta Live Tables pipeline grouped by layer, with row counts, last run status, owners, and the DLT expectations enforced at write time."
      />
      <PipelineInventory />
    </>
  );
}
