import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsReportsPage() {
  return (
    <PdsWorkspacePage
      title="Reports"
      description="Generate management-ready operating packets for forecast review, market review, account review, and closeout governance."
      defaultLens="market"
      defaultHorizon="Forecast"
      sections={["briefing", "reportPacket"]}
      reportPacketType="forecast_pack"
      moduleNotes={[
        {
          label: "Packet Builder",
          title: "Executive Review Packs",
          body: "Reports are generated from the same snapshot package as the command center so the numbers and commentary stay aligned.",
        },
      ]}
    />
  );
}
