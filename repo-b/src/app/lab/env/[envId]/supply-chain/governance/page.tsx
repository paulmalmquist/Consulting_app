import GovernanceMatrix from "@/components/supply-chain/GovernanceMatrix";
import NotebookCallout from "@/components/supply-chain/NotebookCallout";
import { PageHeader } from "@/components/supply-chain/primitives";

interface Props {
  params: Promise<{ envId: string }>;
}

export default async function GovernancePage({ params }: Props) {
  const { envId } = await params;
  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Unity Catalog governance"
        blurb="Catalog hierarchy, sensitive-field tagging, row and column rules, access groups, and an end-to-end lineage example. The same access boundary applies to BI tools, Genie, and APIs."
      />
      <GovernanceMatrix />
      <NotebookCallout pageSlug="governance" envId={envId} />
    </>
  );
}
