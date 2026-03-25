export type PublicPolicyDecision = {
  action: "allow" | "blocked";
  reason: string;
  redactions_applied: boolean;
};

export type PublicAssistantRequest = {
  question: string;
  audience?: string;
  context?: {
    industry?: string;
    company_size?: string;
  };
};

export type PublicAssistantResponse = {
  response_id: string;
  prompt_version: string;
  policy: PublicPolicyDecision;
  answer: string;
  generated_at: string;
};

export type PublicLeadCreateRequest = {
  company_name: string;
  email: string;
  industry?: string;
  team_size?: string;
  source?: string;
};

export type PublicLeadCreateResponse = {
  lead_id: string;
  created_at: string;
  status: "captured";
};
