import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsCloseoutPage() {
  return (
    <PdsWorkspacePage
      title="Closeout"
      description="Finish strong on substantial completion, final billing, survey send, lessons learned, and closeout blocker aging."
      defaultLens="project"
      sections={["satisfactionCloseout", "briefing"]}
      moduleNotes={[
        {
          label: "Completion",
          title: "Close Cleanly",
          body: "Closeout is a leadership problem, not just a project admin task. Final billing, survey send, and lessons learned must close in sequence.",
        },
      ]}
    />
  );
}
