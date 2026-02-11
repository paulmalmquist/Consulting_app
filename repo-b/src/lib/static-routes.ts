export { DEPARTMENT_KEYS } from "./DepartmentRegistry";
export { getCapabilityParams } from "./CapabilityRegistry";

import { CAPABILITY_REGISTRY } from "./CapabilityRegistry";

export const CAPABILITY_KEYS_BY_DEPT: Record<string, string[]> = Object.fromEntries(
  Object.entries(CAPABILITY_REGISTRY).map(([dk, caps]) => [dk, caps.map((c) => c.key)])
);
