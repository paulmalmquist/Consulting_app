"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import { cn } from "@/lib/cn";
import {
  LAB_DEPARTMENTS,
  getDefaultDepartmentForIndustry,
  getEnabledDepartmentsForIndustry,
  type LabDepartmentMeta,
  type LabDepartmentKey,
} from "@/lib/lab/DepartmentRegistry";
import {
  getAllCapabilitiesForDepartment,
  getCapabilitiesForDepartment,
} from "@/lib/lab/CapabilityRegistry";
import { DeptIcon, HouseIcon, PipeIcon } from "@/components/lab/LabIcons";
import {
  addCapability,
  addDepartment,
  getAddedCapabilities,
  getAddedDepartments,
} from "@/lib/lab/envHomepageState";
import AddDepartmentMenu from "@/components/lab/AddDepartmentMenu";
import AddCapabilityMenu from "@/components/lab/AddCapabilityMenu";

type Props = {
  envId: string;
  children: React.ReactNode;
};

function parseDepartmentFromPath(pathname: string, envId: string): LabDepartmentKey | null {
  const prefix = `/lab/env/${envId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const [dept] = rest.split("/");
  if (!dept) return null;
  return dept as LabDepartmentKey;
}

export default function LabEnvironmentShell({ envId, children, isAdmin = false }: Props & { isAdmin?: boolean }) {
  const pathname = usePathname();
  const { selectedEnv, selectEnv } = useEnv();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [addedDepts, setAddedDepts] = useState<string[]>([]);
  const [addedCaps, setAddedCaps] = useState<Record<string, string[]>>({});
  const mobileSidebarRef = useRef<HTMLDivElement>(null);

  const industry = selectedEnv?.env_id === envId
    ? selectedEnv.industry_type || selectedEnv.industry
    : undefined;
  const departments = useMemo(() => {
    const baseDepartments = getEnabledDepartmentsForIndustry(industry);
    if (!addedDepts.length) return baseDepartments;

    const baseKeys = new Set(baseDepartments.map((department) => department.key));
    const extraDepartments = addedDepts
      .map((departmentKey) =>
        LAB_DEPARTMENTS.find((department) => department.key === departmentKey)
      )
      .filter((department): department is LabDepartmentMeta => Boolean(department))
      .filter((department) => !baseKeys.has(department.key));

    return [...baseDepartments, ...extraDepartments];
  }, [industry, addedDepts]);
  const defaultDepartment = useMemo(
    () => getDefaultDepartmentForIndustry(industry),
    [industry]
  );

  const currentDept = useMemo(() => {
    const pathDept = parseDepartmentFromPath(pathname, envId);
    if (pathDept && departments.some((dept) => dept.key === pathDept)) return pathDept;
    if (departments.some((dept) => dept.key === defaultDepartment)) return defaultDepartment;
    return departments[0]?.key || null;
  }, [pathname, envId, departments, defaultDepartment]);

  const capabilities = useMemo(() => {
    if (!currentDept) return [];
    const baseCapabilities = getCapabilitiesForDepartment(currentDept, { industry });
    const allCapabilities = getAllCapabilitiesForDepartment(currentDept, { industry });
    const enabledCapabilityKeys = new Set(baseCapabilities.map((capability) => capability.key));
    for (const capabilityKey of addedCaps[currentDept] || []) {
      enabledCapabilityKeys.add(capabilityKey);
    }
    return allCapabilities.filter((capability) => enabledCapabilityKeys.has(capability.key));
  }, [currentDept, industry, addedCaps]);

  const availableDepartments = useMemo(() => {
    const activeKeys = new Set(departments.map((department) => department.key));
    return LAB_DEPARTMENTS.filter((department) => !activeKeys.has(department.key));
  }, [departments]);

  const availableCapabilities = useMemo(() => {
    if (!currentDept) return [];
    const allCapabilities = getAllCapabilitiesForDepartment(currentDept, { industry });
    const activeCapabilityKeys = new Set(capabilities.map((capability) => capability.key));
    return allCapabilities.filter((capability) => !activeCapabilityKeys.has(capability.key));
  }, [currentDept, industry, capabilities]);

  const handleAddDepartment = useCallback((deptKey: string) => {
    addDepartment(envId, deptKey);
    setAddedDepts((previous) =>
      previous.includes(deptKey) ? previous : [...previous, deptKey]
    );
  }, [envId]);

  const handleAddCapability = useCallback((capKey: string) => {
    if (!currentDept) return;
    addCapability(envId, currentDept, capKey);
    setAddedCaps((previous) => {
      const existing = previous[currentDept] || [];
      if (existing.includes(capKey)) return previous;
      return { ...previous, [currentDept]: [...existing, capKey] };
    });
  }, [envId, currentDept]);

  useEffect(() => {
    if (selectedEnv?.env_id !== envId) {
      selectEnv(envId);
    }
  }, [envId, selectedEnv?.env_id, selectEnv]);

  useEffect(() => {
    setAddedDepts(getAddedDepartments(envId));
    const persistedCapabilities: Record<string, string[]> = {};
    for (const department of LAB_DEPARTMENTS) {
      const capabilityKeys = getAddedCapabilities(envId, department.key);
      if (capabilityKeys.length) {
        persistedCapabilities[department.key] = capabilityKeys;
      }
    }
    setAddedCaps(persistedCapabilities);
  }, [envId]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const drawer = mobileSidebarRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusable?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileSidebarOpen]);

  const isDomainRoute = new RegExp(`^/lab/env/${envId}/(re|pds|credit|legal|medical|consulting)(/|$)`).test(pathname);
  const homeHref = isAdmin ? "/admin" : `/lab/env/${envId}`;
  if (isDomainRoute) {
    return <>{children}</>;
  }

  if (!currentDept) {
    return (
      <div className="rounded-lg border border-bm-border/70 bg-bm-surface/35 p-4">
        No department configuration found for this environment.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Department icon tab bar ──────────────────────── */}
      <div className="rounded-lg border border-bm-border/70 bg-bm-surface/35 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={homeHref}
              data-testid="dept-tab-home"
              aria-label={isAdmin ? "Admin home" : "Environment home"}
              title={isAdmin ? "Admin home" : "Environment home"}
                className={cn(
                "rounded-md border p-2 transition-[transform,box-shadow] duration-[120ms] inline-flex items-center justify-center",
                pathname === `/lab/env/${envId}`
                  ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text"
                  : "border-bm-border/70 text-bm-muted hover:bg-bm-surface/50 hover:text-bm-text"
              )}
            >
              <HouseIcon size={18} />
            </Link>
            {departments.map((dept) => {
              const active = dept.key === currentDept;
              return (
                <Link
                  key={dept.key}
                  href={`/lab/env/${envId}/${dept.key}`}
                  data-testid={`dept-tab-${dept.key}`}
                  aria-label={dept.label}
                  title={dept.label}
                  className={cn(
                    "rounded-md border p-2 transition-[transform,box-shadow] duration-[120ms] inline-flex items-center justify-center",
                    active
                      ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text"
                      : "border-bm-border/70 text-bm-muted hover:bg-bm-surface/50 hover:text-bm-text"
                  )}
                >
                  <DeptIcon deptKey={dept.key} size={18} />
                </Link>
              );
            })}
            <Link
              href={`/lab/env/${envId}/pipeline`}
              aria-label="Pipeline"
              title="Pipeline"
              className={cn(
                "rounded-md border p-2 transition-[transform,box-shadow] duration-[120ms] inline-flex items-center justify-center",
                pathname === `/lab/env/${envId}/pipeline`
                  ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text"
                  : "border-bm-border/70 text-bm-muted hover:bg-bm-surface/50 hover:text-bm-text"
              )}
            >
              <PipeIcon size={18} />
            </Link>
            <AddDepartmentMenu
              availableDepartments={availableDepartments}
              onAdd={handleAddDepartment}
            />
          </div>
          <button
            type="button"
            className="lg:hidden rounded-md border border-bm-border/70 bg-bm-surface/40 px-3 py-1.5 text-sm text-bm-text"
            onClick={() => setMobileSidebarOpen(true)}
            data-testid="lab-env-sidebar-toggle"
          >
            Functions
          </button>
        </div>
      </div>

      {/* ── Desktop sidebar + content ────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[240px,1fr]">
        <aside
          className="hidden lg:block rounded-lg border border-bm-border/70 bg-bm-surface/30 p-3"
          data-testid="lab-sidebar"
        >
          <div className="flex items-center justify-between px-2 pb-2">
            <p className="bm-section-label">
              {departments.find((dept) => dept.key === currentDept)?.label} Functions
            </p>
            <AddCapabilityMenu
              availableCapabilities={availableCapabilities}
              onAdd={handleAddCapability}
            />
          </div>
          <nav className="space-y-1.5">
            {capabilities.map((cap) => {
              const active = pathname.includes(`/capability/${cap.key}`);
              return (
                <Link
                  key={cap.key}
                  href={`/lab/env/${envId}/${currentDept}/capability/${cap.key}`}
                  data-testid={`cap-link-${cap.key}`}
                  className={cn(
                    "block rounded-md border px-3 py-2 text-sm font-normal transition-[transform,box-shadow] duration-[120ms]",
                    active
                      ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text font-medium"
                      : "border-transparent text-bm-muted hover:border-bm-border/70 hover:bg-bm-surface/45"
                  )}
                >
                  {cap.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div>{children}</div>
      </div>

      {/* ── Mobile capability drawer ─────────────────────── */}
      {mobileSidebarOpen ? (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close functions menu"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div
            ref={mobileSidebarRef}
            className="absolute left-0 top-0 h-full w-72 max-w-[88vw] border-r border-bm-border/70 bg-bm-bg/90 p-4"
            role="dialog"
            aria-modal="true"
            data-testid="lab-env-sidebar-drawer"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Functions</p>
              <button
                type="button"
                className="rounded-md border border-bm-border/70 px-2 py-1 text-xs"
                onClick={() => setMobileSidebarOpen(false)}
              >
                Close
              </button>
            </div>
            <nav className="space-y-1.5" data-testid="lab-sidebar">
              {capabilities.map((cap) => (
                <Link
                  key={`${cap.key}-mobile`}
                  href={`/lab/env/${envId}/${currentDept}/capability/${cap.key}`}
                  data-testid={`cap-link-${cap.key}`}
                  className="block rounded-md border border-transparent px-3 py-2 text-sm text-bm-muted hover:border-bm-border/70 hover:bg-bm-surface/45"
                  onClick={() => setMobileSidebarOpen(false)}
                >
                  {cap.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
