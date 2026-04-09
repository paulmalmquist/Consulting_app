import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsHomePage() {
  return (
    <PdsWorkspacePage
      title="Intervention Queue"
      description="Start with the problem. Review ranked interventions, open the flagged project, and move straight into the recovery report."
      defaultLens="project"
      defaultHorizon="Forecast"
      sections={["operatingPosture", "interventionQueue", "briefing"]}
      moduleNotes={[
        {
          label: "Demo Flow",
          title: "Queue -> Project -> Report",
          body: "Everything on this page is trimmed to support the sales path from issue identification into action.",
        },
        {
          label: "Priority",
          title: "Lead with Trouble",
          body: "Operating posture is reduced to at-risk count, total variance, and the top three drivers before the queue takes over.",
        },
      ]}
    />
  );
}
