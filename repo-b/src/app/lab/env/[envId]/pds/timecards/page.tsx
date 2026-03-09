import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsTimecardsPage() {
  return (
    <PdsWorkspacePage
      title="Timecards"
      description="Enforce submission discipline, clear overdue hours, and keep labor reporting aligned with the weekly forecast lock."
      defaultLens="resource"
      sections={["resourceHealth", "briefing"]}
      moduleNotes={[
        {
          label: "Compliance",
          title: "Weekly Lock Discipline",
          body: "Timecards are part of the operating system because delinquency degrades labor burn, utilization, and forecast quality.",
        },
      ]}
    />
  );
}
