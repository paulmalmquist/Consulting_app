import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsMarketsPage() {
  return (
    <PdsWorkspacePage
      title="Markets"
      description="Compare geographic and sector operating performance, backlog coverage, staffing pressure, and forecast movement across markets."
      defaultLens="market"
      sections={["performance", "forecast", "resourceHealth", "briefing"]}
      moduleNotes={[
        {
          label: "Regional Leadership",
          title: "Operational Geography",
          body: "Market view is for regional leaders balancing fee delivery, staffing, and client concentration across the portfolio.",
        },
      ]}
    />
  );
}
