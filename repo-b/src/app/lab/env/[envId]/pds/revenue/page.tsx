import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsRevenuePage() {
  return (
    <PdsWorkspacePage
      title="Revenue & CI"
      description="Manage fee revenue, GAAP revenue, contribution income, collections lag, write-offs, and backlog from a single management surface."
      defaultLens="account"
      sections={["performance", "forecast", "briefing"]}
      moduleNotes={[
        {
          label: "Revenue Discipline",
          title: "Plan vs Actual",
          body: "Fee, GAAP, and CI are treated as first-class operating metrics, not back-office afterthoughts.",
        },
      ]}
    />
  );
}
