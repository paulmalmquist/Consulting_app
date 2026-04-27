export type PipelineGroupKey = "build_target" | "create_conversation" | "close_convert";

export type PipelineGroup = {
  key: PipelineGroupKey;
  label: string;
  description: string;
  stageKeys: string[];
  color: string;      // accent color for group header
  dimColor: string;   // muted version
};

export const PIPELINE_GROUPS: PipelineGroup[] = [
  {
    key: "build_target",
    label: "Build Target",
    description: "Identify, research, and initiate outreach",
    stageKeys: ["target_identified", "researched", "outreach"],
    color: "#22D3EE",
    dimColor: "rgba(34,211,238,0.18)",
  },
  {
    key: "create_conversation",
    label: "Create Conversation",
    description: "Get to discovery and demo",
    stageKeys: ["engaged", "discovery_scheduled", "demo_completed"],
    color: "#F5B942",
    dimColor: "rgba(245,185,66,0.15)",
  },
  {
    key: "close_convert",
    label: "Close / Convert",
    description: "Proposal to signed engagement",
    stageKeys: ["proposal", "negotiation", "closed_won", "closed_lost"],
    color: "#34D399",
    dimColor: "rgba(52,211,153,0.15)",
  },
];

export type BoardViewMode = "groups" | "stages" | "actions";
