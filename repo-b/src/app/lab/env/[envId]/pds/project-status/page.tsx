import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function ProjectStatusPage() {
  return (
    <PdsWorkspacePage
      title="Project Status"
      description="View project health, milestone progress, and delivery status across the active portfolio."
      defaultLens="project"
      defaultHorizon="YTD"
      sections={["performance", "deliveryRisk"]}
    />
  );
}
