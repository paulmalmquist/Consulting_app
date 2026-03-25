import React from "react";

// Minimal mock for next/dynamic — returns a component that renders null in tests.
// next/dynamic is unavailable in the vitest environment (the node_modules/next
// install does not include a dynamic.js entry point).
const dynamic = (
  loader: () => Promise<{ default: React.ComponentType<unknown> }>,
  _options?: { ssr?: boolean; loading?: () => React.ReactElement | null }
): React.ComponentType<unknown> => {
  // Return a placeholder that renders nothing — lazy-loaded map/chart components
  // are not relevant to unit tests and their absence is expected.
  const Placeholder: React.FC<unknown> = () => null;
  Placeholder.displayName = "DynamicComponentMock";
  return Placeholder;
};

export default dynamic;
