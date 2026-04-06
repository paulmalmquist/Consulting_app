/**
 * MapAdapter — captures visible assets and active map overlays.
 *
 * Publishes entity IDs and filter state — not geographic coordinates.
 */
import type { WidgetContext, WidgetContextAdapter } from "./types";

export interface MapData {
  label?: string;
  entityType?: string;
  /** IDs of assets/entities currently visible in the map viewport (max 20). */
  visibleEntityIds?: string[];
  /** Active overlay or layer names. */
  activeOverlays?: string[];
  /** Active filter values on the map. */
  filters?: Record<string, string | number | boolean>;
}

export function createMapAdapter(data: MapData): WidgetContextAdapter {
  return {
    capture(): WidgetContext | null {
      const ctx: WidgetContext = {
        widget_type: "map",
        label: data.label ?? "Map",
      };
      if (data.entityType) ctx.entity_type = data.entityType;
      if (data.visibleEntityIds?.length) ctx.entity_ids = data.visibleEntityIds.slice(0, 20);
      if (data.filters && Object.keys(data.filters).length) ctx.filter_state = data.filters;
      if (data.activeOverlays?.length) {
        // Encode overlays as a filter signal
        ctx.filter_state = {
          ...ctx.filter_state,
          active_overlays: data.activeOverlays.join(","),
        };
      }
      return ctx;
    },
  };
}
