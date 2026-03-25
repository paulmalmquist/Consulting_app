import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function UtilizationPage() {
  return (
    <PdsWorkspacePage
      title="Utilization"
      description="Track resource utilization rates, billable mix, and bench availability by market and role."
      defaultLens="resource"
      defaultHorizon="YTD"
      sections={["performance", "resourceHealth"]}
    />
  );
}
