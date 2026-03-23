function nextId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function resolveRequestId(request: Request): string {
  const headerId = request.headers.get("x-request-id");
  const id = (headerId || "").trim();
  if (id) return id;
  return `req_${nextId()}`;
}

export function withRequestId(requestId: string) {
  return {
    headers: {
      "x-request-id": requestId,
    },
  };
}

export function traceLog(scope: string, payload: Record<string, unknown>) {
  console.info(`[${scope}]`, payload);
}
