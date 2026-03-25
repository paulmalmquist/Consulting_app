import type {
  AssistantEntityType,
  AssistantSelectedEntity,
  AssistantVisibleData,
} from "@/lib/commandbar/types";

export type AssistantAppEnvironmentContext = {
  active_environment_id?: string | null;
  active_environment_name?: string | null;
  active_business_id?: string | null;
  active_business_name?: string | null;
  schema_name?: string | null;
  industry?: string | null;
};

export type AssistantAppPageContext = {
  route?: string | null;
  surface?: string | null;
  active_module?: string | null;
  page_entity_type?: AssistantEntityType | string | null;
  page_entity_id?: string | null;
  page_entity_name?: string | null;
  selected_entities?: AssistantSelectedEntity[];
  visible_data?: AssistantVisibleData | null;
};

export type AssistantAppContextBridge = {
  environment: AssistantAppEnvironmentContext;
  page: AssistantAppPageContext;
  updated_at: number;
};

const EVENT_NAME = "bm:assistant-context-updated";

function defaultBridge(): AssistantAppContextBridge {
  return {
    environment: {},
    page: {
      selected_entities: [],
      visible_data: null,
    },
    updated_at: Date.now(),
  };
}

declare global {
  interface Window {
    __APP_CONTEXT__?: AssistantAppContextBridge;
  }
}

function canUseWindow() {
  return typeof window !== "undefined";
}

function currentBridge(): AssistantAppContextBridge {
  if (!canUseWindow()) return defaultBridge();
  if (!window.__APP_CONTEXT__) {
    window.__APP_CONTEXT__ = defaultBridge();
  }
  return window.__APP_CONTEXT__;
}

function emitUpdate() {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: window.__APP_CONTEXT__ }));
}

export function readAssistantAppContext(): AssistantAppContextBridge | null {
  if (!canUseWindow()) return null;
  return currentBridge();
}

export function publishAssistantEnvironmentContext(partial: AssistantAppEnvironmentContext) {
  if (!canUseWindow()) return;
  const bridge = currentBridge();
  window.__APP_CONTEXT__ = {
    environment: {
      ...bridge.environment,
      ...partial,
    },
    page: bridge.page,
    updated_at: Date.now(),
  };
  emitUpdate();
}

export function publishAssistantPageContext(partial: AssistantAppPageContext) {
  if (!canUseWindow()) return;
  const bridge = currentBridge();
  window.__APP_CONTEXT__ = {
    environment: bridge.environment,
    page: {
      ...bridge.page,
      ...partial,
      selected_entities: partial.selected_entities ?? bridge.page.selected_entities ?? [],
      visible_data: partial.visible_data ?? bridge.page.visible_data ?? null,
    },
    updated_at: Date.now(),
  };
  emitUpdate();
}

export function resetAssistantPageContext() {
  if (!canUseWindow()) return;
  const bridge = currentBridge();
  window.__APP_CONTEXT__ = {
    environment: bridge.environment,
    page: {
      selected_entities: [],
      visible_data: null,
    },
    updated_at: Date.now(),
  };
  emitUpdate();
}

export function subscribeAssistantAppContext(listener: (ctx: AssistantAppContextBridge | null) => void) {
  if (!canUseWindow()) return () => undefined;
  const handler = () => listener(readAssistantAppContext());
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
