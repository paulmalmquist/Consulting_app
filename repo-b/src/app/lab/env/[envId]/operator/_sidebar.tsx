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

export function consultingSidebarSections(envId: string): LeftSidebarSection[] {
  const consultingBase = `/lab/env/${envId}/consulting`;
  const operatorBase = `/lab/env/${envId}/operator`;
  return [
    {
      items: [
        { key: "pipeline", label: "Pipeline", href: `${consultingBase}/pipeline` },
        { key: "execution", label: "Execution", href: `${consultingBase}/execution` },
        { key: "accounting", label: "Accounting", href: `${operatorBase}/accounting` },
        { key: "contacts", label: "Contacts", href: `${consultingBase}/contacts` },
        { key: "tasks", label: "Tasks", href: `${consultingBase}/tasks` },
      ],
    },
  ];
}
