import GovernanceMatrix from "@/components/supply-chain/GovernanceMatrix";
import { PageHeader } from "@/components/supply-chain/primitives";

export default function GovernancePage() {
  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Unity Catalog governance"
        blurb="Catalog hierarchy, sensitive-field tagging, row and column rules, access groups, and an end-to-end lineage example. The same access boundary applies to BI tools, Genie, and APIs."
      />
      <GovernanceMatrix />
    </>
  );
}
