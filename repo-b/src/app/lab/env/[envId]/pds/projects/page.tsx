import { PdsWorkspacePage } from "@/components/pds-enterprise/PdsWorkspacePage";

export default function PdsProjectsPage() {
  return (
    <PdsWorkspacePage
      title="Projects"
      description="Intervene on active delivery: milestone slip, commercial exposure, claims, change orders, permits, and closeout aging."
      defaultLens="project"
      sections={["performance", "deliveryRisk", "satisfactionCloseout", "briefing"]}
      moduleNotes={[
        {
          label: "Delivery",
          title: "Intervention Queue",
          body: "Project view exists to answer what is slipping, why it is slipping, and who needs to act now.",
        },
      ]}
    />
  );
}
