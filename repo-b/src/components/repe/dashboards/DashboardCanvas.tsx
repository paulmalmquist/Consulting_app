"use client";

import React, { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DashboardWidget, DataAvailability, WidgetQueryManifest } from "@/lib/dashboards/types";
import WidgetRenderer from "./WidgetRenderer";

/* --------------------------------------------------------------------------
 * Props
 * -------------------------------------------------------------------------- */
interface Props {
  widgets: DashboardWidget[];
  envId: string;
  businessId: string;
  quarter?: string;
  isEditing: boolean;
  onWidgetsChange: (widgets: DashboardWidget[]) => void;
  onConfigureWidget: (widgetId: string) => void;
  queryManifests?: WidgetQueryManifest[];
  dataAvailabilities?: DataAvailability[];
}

/* --------------------------------------------------------------------------
 * Sortable widget wrapper
 * -------------------------------------------------------------------------- */
function SortableWidget({
  widget,
  envId,
  businessId,
  quarter,
  isEditing,
  onConfigure,
  queryManifest,
  dataAvailability,
}: {
  widget: DashboardWidget;
  envId: string;
  businessId: string;
  quarter?: string;
  isEditing: boolean;
  onConfigure: () => void;
  queryManifest?: WidgetQueryManifest;
  dataAvailability?: DataAvailability;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    gridColumn: `span ${widget.layout.w}`,
    minHeight: `${widget.layout.h * 80}px`,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(isEditing ? listeners : {})}
    >
      <WidgetRenderer
        widget={widget}
        envId={envId}
        businessId={businessId}
        quarter={quarter}
        isEditing={isEditing}
        onConfigure={onConfigure}
        queryManifest={queryManifest}
        dataAvailability={dataAvailability}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Main canvas
 * -------------------------------------------------------------------------- */
export default function DashboardCanvas({
  widgets,
  envId,
  businessId,
  quarter,
  isEditing,
  onWidgetsChange,
  onConfigureWidget,
  queryManifests,
  dataAvailabilities,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = widgets.findIndex((w) => w.id === active.id);
      const newIndex = widgets.findIndex((w) => w.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      onWidgetsChange(arrayMove(widgets, oldIndex, newIndex));
    },
    [widgets, onWidgetsChange],
  );

  const activeWidget = activeId ? widgets.find((w) => w.id === activeId) : null;

  if (widgets.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-2xl border-2 border-dashed border-bm-border/50 bg-bm-surface/5 p-16">
        <div className="text-center">
          <p className="text-lg font-semibold text-bm-muted2">No widgets yet</p>
          <p className="mt-2 text-sm text-bm-muted2">
            Type a prompt above to generate a dashboard, or choose a layout archetype.
          </p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(12, 1fr)" }}
        >
          {widgets.map((widget) => (
            <SortableWidget
              key={widget.id}
              widget={widget}
              envId={envId}
              businessId={businessId}
              quarter={quarter}
              isEditing={isEditing}
              onConfigure={() => onConfigureWidget(widget.id)}
              queryManifest={queryManifests?.find((m) => m.widget_id === widget.id)}
              dataAvailability={dataAvailabilities?.find((d) => d.widget_id === widget.id)}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeWidget ? (
          <div
            style={{
              gridColumn: `span ${activeWidget.layout.w}`,
              minHeight: `${activeWidget.layout.h * 80}px`,
              width: `${(activeWidget.layout.w / 12) * 100}%`,
            }}
            className="opacity-80"
          >
            <WidgetRenderer
              widget={activeWidget}
              envId={envId}
              businessId={businessId}
              quarter={quarter}
              isEditing
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
