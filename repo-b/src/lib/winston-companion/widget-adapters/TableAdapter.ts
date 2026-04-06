/**
 * TableAdapter — captures table column headers, entity type, and selection state.
 *
 * Publishes metadata about what the table shows, not the row data itself.
 */
import type { WidgetContext, WidgetContextAdapter } from "./types";

export interface TableData {
  label?: string;
  entityType?: string;
  /** Canonical column/metric keys visible in the table. */
  columnKeys?: string[];
  entityIds?: string[];
  selectedRowIds?: string[];
  /** Active filter values — primitive values only. */
  filters?: Record<string, string | number | boolean>;
  rowCount?: number;
}

export function createTableAdapter(data: TableData): WidgetContextAdapter {
  return {
    capture(): WidgetContext | null {
      const ctx: WidgetContext = {
        widget_type: "table",
        label: data.label ?? (data.entityType ? `${data.entityType} table` : "Table"),
      };
      if (data.columnKeys?.length) ctx.metrics = data.columnKeys.slice(0, 20);
      if (data.entityType) ctx.entity_type = data.entityType;
      if (data.entityIds?.length) ctx.entity_ids = data.entityIds.slice(0, 20);
      if (data.selectedRowIds?.length) ctx.selected_row_ids = data.selectedRowIds.slice(0, 20);
      if (data.filters && Object.keys(data.filters).length) ctx.filter_state = data.filters;
      return ctx;
    },
  };
}
