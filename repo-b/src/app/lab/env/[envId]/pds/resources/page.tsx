import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsResourcesPage() {
  return (
    <PdsWorkspacePage
      title="Resources"
      description="See over-allocation, staffing gaps, utilization pressure, and timecard compliance before labor burn breaks forecast or delivery."
      defaultLens="resource"
      sections={["performance", "resourceHealth", "briefing"]}
    />
  );
}
