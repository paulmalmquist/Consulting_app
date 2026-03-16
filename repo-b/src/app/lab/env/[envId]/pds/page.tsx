import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsHomePage() {
  return (
    <PdsWorkspacePage
      title="Command Center"
      description="Run Stone PDS from the management questions that matter: which markets are missing plan, which accounts are slipping, where delivery needs intervention, and which teams need staffing or timecard action."
      defaultLens="market"
      defaultHorizon="YTD"
      sections={["interventionQueue", "performance", "deliveryRisk", "resourceHealth", "satisfactionCloseout", "forecast", "briefing"]}
      moduleNotes={[
        {
          label: "Portfolio",
          title: "Market vs Account",
          body: "Switch between regional operating performance and strategic-account performance without leaving the homepage.",
        },
        {
          label: "Financial",
          title: "Fee, GAAP, and CI",
          body: "Revenue management is front and center, with backlog, forecast movement, and intervention signals on the same surface.",
        },
        {
          label: "Execution",
          title: "Delivery, Staffing, Closeout",
          body: "Red projects, timecard delinquency, staffing pressure, client satisfaction, and closeout blockers are treated as one operating system.",
        },
      ]}
    />
  );
}
