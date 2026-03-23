import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function OperationalSignalsPage() {
  return (
    <PdsWorkspacePage
      title="Operational Signals"
      description="Aggregate operational health indicators across delivery, staffing, financials, and client domains."
      defaultLens="market"
      defaultHorizon="YTD"
      sections={["interventionQueue", "signals", "deliveryRisk", "resourceHealth"]}
    />
  );
}
