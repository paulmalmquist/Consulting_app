import ArchitectureFlow from "@/components/supply-chain/ArchitectureFlow";
import NotebookCallout from "@/components/supply-chain/NotebookCallout";
import { PageHeader } from "@/components/supply-chain/primitives";

interface Props {
  params: Promise<{ envId: string }>;
}

export default async function ArchitecturePage({ params }: Props) {
  const { envId } = await params;
  return (
    <>
      <PageHeader
        eyebrow="Architecture"
        title="Lakehouse architecture"
        blurb="The end-to-end picture from source systems to consumers. Bronze for raw, Silver for conformed, Gold for certified products. Unity Catalog governs every layer."
      />
      <ArchitectureFlow />
      <NotebookCallout pageSlug="architecture" envId={envId} />
    </>
  );
}
