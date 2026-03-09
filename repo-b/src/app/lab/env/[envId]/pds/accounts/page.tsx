import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsAccountsPage() {
  return (
    <PdsWorkspacePage
      title="Accounts"
      description="Operate strategic accounts with profitability, client satisfaction, red-project exposure, collections leakage, and owner accountability in one place."
      defaultLens="account"
      sections={["performance", "deliveryRisk", "satisfactionCloseout", "briefing"]}
      moduleNotes={[
        {
          label: "Strategic Accounts",
          title: "Client Operating Mode",
          body: "Account view is distinct from market view so account directors can manage client health and portfolio economics directly.",
        },
      ]}
    />
  );
}
