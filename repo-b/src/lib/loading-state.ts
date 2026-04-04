/**
 * Winston Loader — global loading state store.
 *
 * Driven by real application events:
 *   - Route transitions (Next.js navigation)
 *   - API calls (apiFetch / bosFetch wrappers)
 *   - AI streaming (SSE from assistant)
 *   - MCP tool execution
 *
 * Consumers call the imperative helpers; components use useWinstonLoader().
 */

import { create } from "zustand";

export type LoaderPhase =
  | "idle"
  | "loading_fast"   // 0–300 ms — route start or first API call
  | "loading_slow"   // 300 ms+ — still waiting
  | "thinking"       // AI stream active
  | "complete";      // all resolved, play exit animation then idle

type LoadingStore = {
  activeApiCalls: number;
  routeChanging: boolean;
  aiStreaming: boolean;
  mcpRunning: boolean;
  /** Derived phase — computed by resolvePhase(), not stored directly */
  phase: LoaderPhase;
  /** Microcopy shown after 800 ms */
  label: string | null;
  /** Internal: timestamp when loading started */
  _startedAt: number | null;

  // Mutators
  routeStart: () => void;
  routeEnd: () => void;
  apiStart: (label?: string) => void;
  apiEnd: () => void;
  aiStart: () => void;
  aiEnd: () => void;
  mcpStart: () => void;
  mcpEnd: () => void;
  /** Force a complete then idle transition */
  forceComplete: () => void;
};

type PhaseInputs = Pick<LoadingStore, "activeApiCalls" | "routeChanging" | "aiStreaming" | "mcpRunning">;

function resolvePhase(s: PhaseInputs): LoaderPhase {
  if (s.aiStreaming) return "thinking";
  const busy = s.routeChanging || s.activeApiCalls > 0 || s.mcpRunning;
  if (!busy) return "idle";
  return "loading_fast";
}

function actions(set: (fn: (s: LoadingStore) => Partial<LoadingStore>) => void, get: () => LoadingStore) {
  let _slowTimer: ReturnType<typeof setTimeout> | null = null;
  let _completeTimer: ReturnType<typeof setTimeout> | null = null;

  function setPhaseAndLabel(patch: Partial<LoadingStore>) {
    // Clear pending complete transition if new activity starts
    if (_completeTimer) { clearTimeout(_completeTimer); _completeTimer = null; }

    set((s) => {
      const next = { ...s, ...patch };
      const phase = resolvePhase(next);

      // Start slow-phase timer if transitioning to fast
      if (phase === "loading_fast" && s.phase === "idle") {
        if (_slowTimer) clearTimeout(_slowTimer);
        _slowTimer = setTimeout(() => {
          set((inner) => {
            const stillBusy = inner.routeChanging || inner.activeApiCalls > 0 || inner.mcpRunning || inner.aiStreaming;
            if (!stillBusy) return {};
            return { phase: "loading_slow" };
          });
        }, 300);
      }

      // When returning to idle, play complete first
      if (phase === "idle" && s.phase !== "idle" && s.phase !== "complete") {
        if (_slowTimer) { clearTimeout(_slowTimer); _slowTimer = null; }
        _completeTimer = setTimeout(() => {
          set(() => ({ phase: "idle", label: null, _startedAt: null }));
        }, 600); // duration of exit animation
        return { ...next, phase: "complete" };
      }

      return { ...next, phase };
    });
  }

  return {
    routeStart() {
      setPhaseAndLabel({ routeChanging: true, _startedAt: Date.now() });
    },
    routeEnd() {
      setPhaseAndLabel({ routeChanging: false });
    },
    apiStart(label?: string) {
      setPhaseAndLabel({
        activeApiCalls: get().activeApiCalls + 1,
        _startedAt: get()._startedAt ?? Date.now(),
        ...(label ? { label } : {}),
      });
    },
    apiEnd() {
      const count = Math.max(0, get().activeApiCalls - 1);
      setPhaseAndLabel({ activeApiCalls: count });
    },
    aiStart() {
      setPhaseAndLabel({ aiStreaming: true });
    },
    aiEnd() {
      setPhaseAndLabel({ aiStreaming: false });
    },
    mcpStart() {
      setPhaseAndLabel({ mcpRunning: true });
    },
    mcpEnd() {
      setPhaseAndLabel({ mcpRunning: false });
    },
    forceComplete() {
      if (_slowTimer) { clearTimeout(_slowTimer); _slowTimer = null; }
      set(() => ({ phase: "complete" }));
      _completeTimer = setTimeout(() => {
        set(() => ({ phase: "idle", label: null, _startedAt: null }));
      }, 600);
    },
  };
}

export const useWinstonLoader = create<LoadingStore>((set, get) => ({
  activeApiCalls: 0,
  routeChanging: false,
  aiStreaming: false,
  mcpRunning: false,
  phase: "idle",
  label: null,
  _startedAt: null,
  ...actions(set, get),
}));

// ─── Convenience imperative API (callable outside React) ────────────────────

export const winstonLoader = {
  routeStart: () => useWinstonLoader.getState().routeStart(),
  routeEnd: () => useWinstonLoader.getState().routeEnd(),
  apiStart: (label?: string) => useWinstonLoader.getState().apiStart(label),
  apiEnd: () => useWinstonLoader.getState().apiEnd(),
  aiStart: () => useWinstonLoader.getState().aiStart(),
  aiEnd: () => useWinstonLoader.getState().aiEnd(),
  mcpStart: () => useWinstonLoader.getState().mcpStart(),
  mcpEnd: () => useWinstonLoader.getState().mcpEnd(),
};
