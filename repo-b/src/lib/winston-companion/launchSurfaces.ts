import launchSurfacesContract from "../../../contracts/winston-launch-surfaces.json";

export type WinstonLaunchSurfaceDefinition = {
  id: string;
  route_pattern: string;
  surface: string;
  thread_kind: "contextual" | "general";
  scope_type: string;
  required_context_fields: string[];
  launch_source: string;
  entity_selection_required: boolean;
  expected_degraded_behavior: string;
};

export type WinstonLaunchSurfaceContract = {
  schema_version_marker: string;
  surfaces: WinstonLaunchSurfaceDefinition[];
};

const contract = launchSurfacesContract as WinstonLaunchSurfaceContract;

export function getWinstonLaunchSurfaceContract(): WinstonLaunchSurfaceContract {
  return contract;
}

export function getSupportedWinstonLaunchSurfaces(): WinstonLaunchSurfaceDefinition[] {
  return contract.surfaces;
}

export function matchWinstonLaunchSurface(route: string | null | undefined): WinstonLaunchSurfaceDefinition | null {
  if (!route) return null;
  return contract.surfaces.find((surface) => new RegExp(surface.route_pattern).test(route)) || null;
}
