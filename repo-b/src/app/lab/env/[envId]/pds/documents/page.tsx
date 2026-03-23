import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsDocumentsPage() {
  return (
    <PdsWorkspacePage
      title="Documents"
      description="Keep documents subordinate to the operating system. Drawings, permits, contracts, and closeout artifacts should support management decisions, not replace them."
      defaultLens="project"
      sections={["performance", "briefing"]}
      moduleNotes={[
        {
          label: "Document Control",
          title: "Support Delivery Decisions",
          body: "Documents remain available, but they are intentionally demoted below revenue, risk, staffing, client health, and closeout on the PDS homepage.",
        },
      ]}
    />
  );
}
