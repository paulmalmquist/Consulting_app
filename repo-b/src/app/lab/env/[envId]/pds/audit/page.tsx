import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsAuditPage() {
  return (
    <PdsWorkspacePage
      title="Audit"
      description="Review governance, interventions, and forecast-control decisions without diluting the core management workflow."
      defaultLens="account"
      sections={["performance", "briefing"]}
      moduleNotes={[
        {
          label: "Governance",
          title: "Decision Traceability",
          body: "Audit belongs in the environment, but it should follow management decisions rather than dominate the homepage.",
        },
      ]}
    />
  );
}
