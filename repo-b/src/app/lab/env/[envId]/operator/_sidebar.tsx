import type { LeftSidebarSection } from "@/components/operator/command-desk";

export function operatorSidebarSections(envId: string): LeftSidebarSection[] {
  const base = `/lab/env/${envId}/operator`;
  return [
    {
      items: [
        { key: "pipeline", label: "Pipeline", href: `${base}/pipeline` },
        { key: "capital-raising", label: "Capital Raising", href: `${base}/capital-raising` },
        { key: "accounting", label: "Accounting", href: `${base}/accounting` },
      ],
    },
    {
      label: "WORK",
      items: [
        { key: "engagements", label: "Engagements", href: `${base}/engagements` },
        { key: "product", label: "Product", href: `${base}/product` },
        { key: "research", label: "Research", href: `${base}/research` },
        { key: "tasks", label: "Tasks", href: `${base}/tasks` },
      ],
    },
  ];
}
