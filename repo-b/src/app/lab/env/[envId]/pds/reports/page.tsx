import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsReportsPage() {
  return (
    <PdsWorkspacePage
      title="Report Output"
      description="Generate the executive recovery memo the buyer can imagine sending immediately after the project review."
      defaultLens="project"
      defaultHorizon="Forecast"
      sections={["briefing", "reportPacket"]}
      reportPacketType="recovery_memo"
      moduleNotes={[
        {
          label: "Flagship Output",
          title: "Executive Recovery Memo",
          body: "This is the third step in the demo flow and should read like a client-ready recovery document, not a dashboard export.",
        },
      ]}
    />
  );
}
