export type IndustryPack = {
  name: string;
  prompts: string[];
  workflows: string[];
  riskRules: { keyword: string; level: "low" | "medium" | "high" }[];
};

export const industryPacks: Record<string, IndustryPack> = {
  healthcare: {
    name: "Healthcare",
    prompts: [
      "Summarize the latest patient intake notes.",
      "Highlight any care gaps for the cardiology team."
    ],
    workflows: ["Prior authorization review", "Post-visit follow-ups"],
    riskRules: [
      { keyword: "diagnosis", level: "high" },
      { keyword: "medication", level: "medium" }
    ]
  },
  legal: {
    name: "Legal",
    prompts: [
      "Draft a summary of the discovery documents.",
      "List pending contract risks for review."
    ],
    workflows: ["Case intake", "Contract review"],
    riskRules: [
      { keyword: "settlement", level: "high" },
      { keyword: "liability", level: "medium" }
    ]
  },
  construction: {
    name: "Construction",
    prompts: [
      "Summarize safety incident reports.",
      "List open change orders for the client."
    ],
    workflows: ["Site inspections", "RFI processing"],
    riskRules: [
      { keyword: "injury", level: "high" },
      { keyword: "change order", level: "medium" }
    ]
  }
};
