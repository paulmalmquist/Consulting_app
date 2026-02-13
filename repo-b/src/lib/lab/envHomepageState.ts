const STORAGE_PREFIX = "lab_homepage_state_";

type HomepageState = {
  version: 1;
  departments: string[];
  capabilities: Record<string, string[]>;
};

function defaultState(): HomepageState {
  return {
    version: 1,
    departments: [],
    capabilities: {},
  };
}

function storageKey(envId: string) {
  return `${STORAGE_PREFIX}${envId}`;
}

function readState(envId: string): HomepageState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(storageKey(envId));
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<HomepageState>;
    return {
      version: 1,
      departments: Array.isArray(parsed.departments) ? parsed.departments : [],
      capabilities: parsed.capabilities && typeof parsed.capabilities === "object"
        ? parsed.capabilities
        : {},
    };
  } catch {
    return defaultState();
  }
}

function writeState(envId: string, state: HomepageState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(envId), JSON.stringify(state));
}

export function getAddedDepartments(envId: string): string[] {
  return readState(envId).departments;
}

export function addDepartment(envId: string, deptKey: string) {
  const state = readState(envId);
  if (state.departments.includes(deptKey)) return;
  state.departments = [...state.departments, deptKey];
  writeState(envId, state);
}

export function getAddedCapabilities(envId: string, deptKey: string): string[] {
  const capabilities = readState(envId).capabilities[deptKey];
  return Array.isArray(capabilities) ? capabilities : [];
}

export function addCapability(envId: string, deptKey: string, capKey: string) {
  const state = readState(envId);
  const current = Array.isArray(state.capabilities[deptKey])
    ? state.capabilities[deptKey]
    : [];
  if (current.includes(capKey)) return;
  state.capabilities = {
    ...state.capabilities,
    [deptKey]: [...current, capKey],
  };
  writeState(envId, state);
}
