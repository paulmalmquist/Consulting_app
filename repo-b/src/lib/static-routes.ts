export const DEPARTMENT_KEYS = [
  "finance",
  "operations",
  "hr",
  "sales",
  "legal",
  "it",
  "marketing",
] as const;

export const CAPABILITY_KEYS_BY_DEPT: Record<string, string[]> = {
  finance: ["invoice_processing", "expense_review", "finance_documents", "finance_history"],
  operations: ["quality_check", "vendor_onboarding", "ops_documents", "ops_history"],
  hr: ["onboard_employee", "policy_review", "hr_documents", "hr_history"],
  sales: ["proposal_gen", "contract_review", "sales_documents", "sales_history"],
  legal: ["compliance_check", "legal_documents", "legal_history"],
  it: ["incident_report", "change_request", "it_documents", "it_history"],
  marketing: ["campaign_brief", "marketing_documents", "marketing_history"],
};

export function getCapabilityParams() {
  return DEPARTMENT_KEYS.flatMap((deptKey) =>
    (CAPABILITY_KEYS_BY_DEPT[deptKey] || []).map((capKey) => ({ deptKey, capKey }))
  );
}
