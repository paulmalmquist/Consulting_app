import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function ProcessCompliancePage() {
  return (
    <PdsWorkspacePage
      title="Process Compliance"
      description="Monitor adherence to operational standards including timecard discipline, closeout procedures, and reporting cadence."
      defaultLens="resource"
      defaultHorizon="YTD"
      sections={["resourceHealth", "satisfactionCloseout"]}
    />
  );
}
