import ArchitectureFlow from "@/components/supply-chain/ArchitectureFlow";
import { PageHeader } from "@/components/supply-chain/primitives";

export default function ArchitecturePage() {
  return (
    <>
      <PageHeader
        eyebrow="Architecture"
        title="Lakehouse architecture"
        blurb="The end-to-end picture from source systems to consumers. Bronze for raw, Silver for conformed, Gold for certified products. Unity Catalog governs every layer."
      />
      <ArchitectureFlow />
    </>
  );
}
