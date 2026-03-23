import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsConfigurationPage() {
  return (
    <PdsWorkspacePage
      title="Configuration"
      description="Configure markets, accounts, staffing assumptions, forecast rules, and packet defaults without falling back to a generic admin shell."
      defaultLens="market"
      sections={["performance", "briefing"]}
      moduleNotes={[
        {
          label: "Environment Template",
          title: "PDS-Specific Defaults",
          body: "This environment is explicitly templated as PDS Enterprise, so navigation, homepage, metrics, and AI surfaces stay construction-management specific.",
        },
      ]}
    />
  );
}
