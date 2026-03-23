import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsMarketsPage() {
  return (
    <PdsWorkspacePage
      title="Markets"
      description="Regional COO command center — revenue, staffing, backlog, and forecast risk at a glance."
      defaultLens="market"
      sections={["signals", "performance", "leaderboard", "resourceHealth", "forecast", "briefing"]}
      moduleNotes={[
        {
          label: "Regional Leadership",
          title: "Operational Geography",
          body: "Revenue delivery, staffing pressure, and client concentration across the portfolio.",
        },
      ]}
    />
  );
}
