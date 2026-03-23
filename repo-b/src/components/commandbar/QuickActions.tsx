"use client";

import { Button } from "@/components/ui/Button";

export type QuickAction = {
  id: string;
  label: string;
  prompt: string;
  description: string;
};

export default function QuickActions({
  actions,
  disabled,
  onSelect,
}: {
  actions: QuickAction[];
  disabled?: boolean;
  onSelect: (action: QuickAction) => void;
}) {
  if (!actions.length) return null;

  return (
    <div className="space-y-2">
      <p className="bm-section-label">Quick Actions</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant="secondary"
            className="rounded-full"
            disabled={disabled}
            title={action.description}
            aria-label={`${action.label}: ${action.description}`}
            data-testid={`quick-action-${action.id}`}
            onClick={() => onSelect(action)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
