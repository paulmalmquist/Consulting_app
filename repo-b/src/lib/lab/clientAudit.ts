export type LabAuditEvent = {
  id: string;
  type:
    | "env_selected"
    | "capability_navigation"
    | "commandbar_submitted"
    | "role_changed";
  envId?: string;
  details?: Record<string, unknown>;
  at: string;
};

const STORAGE_KEY = "lab_client_audit_events";
const MAX_EVENTS = 200;

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `audit_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function readEvents(): LabAuditEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LabAuditEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(events: LabAuditEvent[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
}

export function logLabAuditEvent(
  type: LabAuditEvent["type"],
  payload: { envId?: string; details?: Record<string, unknown> } = {}
) {
  if (typeof window === "undefined") return;

  const next: LabAuditEvent = {
    id: makeId(),
    type,
    envId: payload.envId,
    details: payload.details,
    at: new Date().toISOString(),
  };

  const events = readEvents();
  events.unshift(next);
  writeEvents(events);
}
