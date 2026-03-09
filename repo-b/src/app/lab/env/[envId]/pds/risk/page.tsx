import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsRiskPage() {
  return (
    <PdsWorkspacePage
      title="Delivery Risk"
      description="Focus on the projects and accounts where schedule slip, fee variance, staffing gaps, claims, permits, or closeout aging require intervention."
      defaultLens="project"
      sections={["performance", "deliveryRisk", "briefing"]}
    />
  );
}
