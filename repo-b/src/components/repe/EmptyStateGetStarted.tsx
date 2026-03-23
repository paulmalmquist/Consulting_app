import React from "react";

interface EmptyStateGetStartedProps {
  show: boolean;
}

export function EmptyStateGetStarted({ show }: EmptyStateGetStartedProps) {
  if (!show) return null;
  return (
    <div data-testid="repe-empty-state">
      <h3>Get Started</h3>
      <p>Create your first fund to initialize the workspace.</p>
    </div>
  );
}
