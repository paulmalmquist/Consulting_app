"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import { cn } from "@/lib/cn";
import {
  getDefaultDepartmentForIndustry,
  getEnabledDepartmentsForIndustry,
  LAB_DEPARTMENTS,
  type LabDepartmentKey,
  type LabDepartmentMeta,
} from "@/lib/lab/DepartmentRegistry";
import {
  getCapabilitiesForDepartment,
  type LabCapabilityMeta,
  groupCapabilities,
  type LabCapabilityCategory,
} from "@/lib/lab/CapabilityRegistry";
import { DeptIcon, LogOutIcon } from "@/components/lab/LabIcons";
import {
  type LabRole,
  filterCapabilitiesByRole,
  filterDepartmentsByRole,
  getStoredLabRole,
} from "@/lib/lab/rbac";
import { logLabAuditEvent } from "@/lib/lab/clientAudit";
import { addDepartment, addCapability, getAddedDepartments, getEnabledCapabilities } from "@/lib/envData";
import AddDepartmentMenu from "@/components/lab/AddDepartmentMenu";
import AddCapabilityMenu from "@/components/lab/AddCapabilityMenu";
import { capabilityRoute, deptRoute, setStoredLastDept } from "@/lib/lab/deptRouting";

type Props = {
  envId: string;
  children: React.ReactNode;
};

function parseDepartmentFromPath(pathname: string, envId: string): LabDepartmentKey | null {
  const prefix = `/lab/env/${envId}/dept/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const [dept] = rest.split("/");
  if (!dept) return null;
  return dept as LabDepartmentKey;
}

function parseCapabilityFromPath(pathname: string, envId: string): string | null {
  const prefix = `/lab/env/${envId}/dept/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const parts = rest.split("/");
  if (parts[1] !== "capability") return null;
  return parts[2] || null;
}

function GroupedCapabilityNav({
  envId,
  currentDept,
  pathname,
  groups,
  collapsedGroups,
  onToggleGroup,
  onNavigate,
}: {
  envId: string;
  currentDept: LabDepartmentKey;
  pathname: string;
  groups: Record<LabCapabilityCategory, LabCapabilityMeta[]>;
  collapsedGroups: Record<LabCapabilityCategory, boolean>;
  onToggleGroup: (group: LabCapabilityCategory) => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-2">
      {(Object.keys(groups) as LabCapabilityCategory[]).map((groupName) => {
        const items = groups[groupName];
        if (!items.length) return null;

        return (
          <section key={groupName} className="space-y-1">
            <button
              type="button"
              className="w-full rounded-md px-2 py-1 text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2 hover:bg-bm-surface/35"
              onClick={() => onToggleGroup(groupName)}
            >
              {groupName} {collapsedGroups[groupName] ? "+" : "-"}
            </button>
            {!collapsedGroups[groupName] ? (
              <div className="space-y-1">
                {items.map((cap) => {
                  const active = pathname.includes(`/capability/${cap.key}`);
                  return (
                    <Link
                      key={cap.key}
                      href={capabilityRoute(envId, currentDept, cap.key)}
                      data-testid={`cap-link-${cap.key}`}
                      onClick={onNavigate}
                      className={cn(
                        "block rounded-lg border px-3 py-2 text-sm transition",
                        active
                          ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text"
                          : "border-transparent text-bm-muted hover:border-bm-border/70 hover:bg-bm-surface/45"
                      )}
                    >
                      {cap.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export default function LabEnvironmentShell({ envId, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedEnv, selectEnv } = useEnv();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [capabilityQuery, setCapabilityQuery] = useState("");
  const [role, setRole] = useState<LabRole>(() => getStoredLabRole());
  const mobileSidebarRef = useRef<HTMLDivElement>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<LabCapabilityCategory, boolean>>({
    Data: false,
    Workflows: false,
    Reports: false,
    Admin: false,
  });
  const [addedDepts, setAddedDepts] = useState<string[]>([]);
  const [addedCaps, setAddedCaps] = useState<Record<string, string[]>>({});

  // Load persisted added departments/capabilities
  useEffect(() => {
    setAddedDepts(getAddedDepartments(envId));
    // Load capabilities for all departments
    const caps: Record<string, string[]> = {};
    for (const dept of LAB_DEPARTMENTS) {
      const enabled = getEnabledCapabilities(envId, dept.key);
      if (enabled.length) caps[dept.key] = enabled;
    }
    setAddedCaps(caps);
  }, [envId]);

  const industry = selectedEnv?.env_id === envId ? selectedEnv.industry : undefined;

  // Merge industry-template departments + user-added departments
  const departments = useMemo(() => {
    const enabled = getEnabledDepartmentsForIndustry(industry);
    const enabledKeys = new Set(enabled.map((d) => d.key));
    const extra = addedDepts
      .filter((k) => !enabledKeys.has(k as LabDepartmentKey))
      .map((k) => LAB_DEPARTMENTS.find((d) => d.key === k))
      .filter(Boolean) as LabDepartmentMeta[];
    return filterDepartmentsByRole(role, [...enabled, ...extra]);
  }, [industry, role, addedDepts]);

  const defaultDepartment = useMemo(
    () => getDefaultDepartmentForIndustry(industry),
    [industry]
  );

  const fallbackDept = useMemo(() => {
    if (departments.some((dept) => dept.key === defaultDepartment)) return defaultDepartment;
    return departments[0]?.key || null;
  }, [departments, defaultDepartment]);

  const currentDept = useMemo(() => {
    const pathDept = parseDepartmentFromPath(pathname, envId);
    if (pathDept && departments.some((dept) => dept.key === pathDept)) return pathDept;
    return fallbackDept;
  }, [pathname, envId, departments, fallbackDept]);

  const capabilities = useMemo(() => {
    if (!currentDept) return [];
    const raw = getCapabilitiesForDepartment(currentDept, { industry });
    return filterCapabilitiesByRole(role, raw);
  }, [currentDept, industry, role]);

  const filteredCapabilities = useMemo(() => {
    const query = capabilityQuery.trim().toLowerCase();
    if (!query) return capabilities;
    return capabilities.filter(
      (cap) =>
        cap.label.toLowerCase().includes(query) ||
        cap.description.toLowerCase().includes(query) ||
        cap.key.toLowerCase().includes(query)
    );
  }, [capabilities, capabilityQuery]);

  const groupedCapabilities = useMemo(
    () => groupCapabilities(filteredCapabilities),
    [filteredCapabilities]
  );

  const currentCapabilityKey = useMemo(
    () => parseCapabilityFromPath(pathname, envId),
    [pathname, envId]
  );

  const currentCapability = useMemo(
    () => capabilities.find((cap) => cap.key === currentCapabilityKey) || null,
    [capabilities, currentCapabilityKey]
  );

  const currentDeptMeta = departments.find((dept) => dept.key === currentDept);
  const envName = selectedEnv?.client_name?.trim() || `Environment ${envId.slice(0, 8)}`;

  // Available departments that are not already active
  const availableDepartments = useMemo(() => {
    const activeKeys = new Set(departments.map((d) => d.key));
    return LAB_DEPARTMENTS.filter((d) => !activeKeys.has(d.key));
  }, [departments]);

  // Available capabilities not yet shown for current department
  const availableCapabilities = useMemo(() => {
    if (!currentDept) return [];
    const allCaps = getCapabilitiesForDepartment(currentDept, { industry });
    const visibleKeys = new Set(capabilities.map((c) => c.key));
    return allCaps.filter((c) => !visibleKeys.has(c.key));
  }, [currentDept, industry, capabilities]);

  const handleAddDepartment = useCallback((deptKey: string) => {
    addDepartment(envId, deptKey);
    setAddedDepts((prev) => prev.includes(deptKey) ? prev : [...prev, deptKey]);
  }, [envId]);

  const handleAddCapability = useCallback((capKey: string) => {
    if (!currentDept) return;
    addCapability(envId, currentDept, capKey);
    setAddedCaps((prev) => {
      const existing = prev[currentDept] || [];
      if (existing.includes(capKey)) return prev;
      return { ...prev, [currentDept]: [...existing, capKey] };
    });
  }, [envId, currentDept]);

  const handleLogout = useCallback(() => {
    // Clear session artifacts
    if (typeof document !== "undefined") {
      document.cookie = "demo_lab_session=; path=/; max-age=0";
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("lab_active_env_id");
      localStorage.removeItem("demo_lab_env_id");
      localStorage.removeItem("lab_user_role");
    }
    if (typeof window !== "undefined") {
      window.location.assign("/lab/environments");
      return;
    }
    router.push("/lab/environments");
  }, [router]);

  useEffect(() => {
    if (selectedEnv?.env_id !== envId) {
      selectEnv(envId);
    }
  }, [envId, selectedEnv?.env_id, selectEnv]);

  useEffect(() => {
    const pathDept = parseDepartmentFromPath(pathname, envId);
    if (!pathDept || !fallbackDept) return;
    if (!departments.some((dept) => dept.key === pathDept)) {
      router.replace(deptRoute(envId, fallbackDept));
    }
  }, [pathname, envId, departments, fallbackDept, router]);

  useEffect(() => {
    if (!currentDept) return;
    setStoredLastDept(envId, currentDept);
  }, [envId, currentDept]);

  useEffect(() => {
    const syncRole = () => setRole(getStoredLabRole());
    window.addEventListener("storage", syncRole);
    return () => window.removeEventListener("storage", syncRole);
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const titleParts = [envName, currentDeptMeta?.label, currentCapability?.label].filter(Boolean);
    if (titleParts.length) {
      document.title = `${titleParts.join(" > ")} | Lab Environments`;
    }
  }, [envName, currentDeptMeta?.label, currentCapability?.label]);

  useEffect(() => {
    if (!currentDept || !currentCapability) return;
    logLabAuditEvent("capability_navigation", {
      envId,
      details: {
        deptKey: currentDept,
        capabilityKey: currentCapability.key,
        pathname,
      },
    });
  }, [envId, currentDept, currentCapability?.key, pathname]);

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

  const toggleGroup = (group: LabCapabilityCategory) => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  if (!currentDept) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-4">
        No department access for current role. Switch role to view this environment.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Environment Header ─────────────────────────────────── */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-3" data-testid="env-header">
        <div className="mb-3 flex items-center justify-between rounded-lg border border-bm-border/60 bg-bm-surface/25 px-3 py-2">
          <div className="text-sm text-bm-muted" data-testid="env-title">
            <span className="font-medium text-bm-text">{envName}</span>
            <span className="mx-1.5">&gt;</span>
            <span>{currentDeptMeta?.label || "Department"}</span>
            {currentCapability ? (
              <>
                <span className="mx-1.5">&gt;</span>
                <span>{currentCapability.label}</span>
              </>
            ) : null}
          </div>
          <button
            type="button"
            data-testid="logout-button"
            onClick={handleLogout}
            title="Logout"
            className="rounded-lg border border-bm-border/70 px-2.5 py-1.5 text-xs text-bm-muted hover:bg-bm-surface/50 hover:text-bm-text transition inline-flex items-center gap-1.5"
          >
            <LogOutIcon size={14} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>

        {/* ── Department tabs + Add Department ──────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {departments.map((dept) => {
              const active = dept.key === currentDept;
              return (
                <Link
                  key={dept.key}
                  href={deptRoute(envId, dept.key)}
                  data-testid={`dept-tab-${dept.key}`}
                  aria-label={dept.label}
                  aria-current={active ? "page" : undefined}
                  data-selected={active ? "true" : "false"}
                  title={dept.label}
                  onClick={() => setStoredLastDept(envId, dept.key)}
                  className={cn(
                    "rounded-lg border h-9 w-9 transition inline-flex items-center justify-center",
                    active
                      ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text"
                      : "border-bm-border/70 text-bm-muted hover:bg-bm-surface/50 hover:text-bm-text"
                  )}
                >
                  <DeptIcon deptKey={dept.key} size={16} />
                  <span className="sr-only">{dept.label}</span>
                </Link>
              );
            })}
            <AddDepartmentMenu
              availableDepartments={availableDepartments}
              onAdd={handleAddDepartment}
            />
          </div>
          <button
            type="button"
            className="lg:hidden rounded-lg border border-bm-border/70 bg-bm-surface/40 px-3 py-1.5 text-sm text-bm-text"
            onClick={() => setMobileSidebarOpen(true)}
            data-testid="lab-env-sidebar-toggle"
          >
            Functions
          </button>
        </div>
      </div>

      {/* ── Sidebar + Main content ─────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
        <aside
          className="hidden lg:block rounded-xl border border-bm-border/70 bg-bm-surface/30 p-3"
          data-testid="lab-sidebar"
        >
          <div className="flex items-center justify-between px-2 pb-2">
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
              {currentDeptMeta?.label} Functions
            </p>
            <AddCapabilityMenu
              availableCapabilities={availableCapabilities}
              onAdd={handleAddCapability}
            />
          </div>
          <input
            type="search"
            value={capabilityQuery}
            onChange={(event) => setCapabilityQuery(event.target.value)}
            placeholder="Filter capabilities"
            className="mb-2 w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
          />
          <GroupedCapabilityNav
            envId={envId}
            currentDept={currentDept}
            pathname={pathname}
            groups={groupedCapabilities}
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
          />
        </aside>

        <div>{children}</div>
      </div>

      {/* ── Mobile sidebar drawer ──────────────────────────────── */}
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
            className="absolute left-0 top-0 h-full w-80 max-w-[90vw] border-r border-bm-border/70 bg-bm-bg/90 p-4"
            role="dialog"
            aria-modal="true"
            data-testid="lab-env-sidebar-drawer"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Functions</p>
              <button
                type="button"
                className="rounded-lg border border-bm-border/70 px-2 py-1 text-xs"
                onClick={() => setMobileSidebarOpen(false)}
              >
                Close
              </button>
            </div>
            <input
              type="search"
              value={capabilityQuery}
              onChange={(event) => setCapabilityQuery(event.target.value)}
              placeholder="Filter capabilities"
              className="mb-3 w-full rounded-lg border border-bm-border/70 bg-bm-surface/35 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
            />
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-2">Departments</p>
            <nav className="mb-3 grid grid-cols-4 gap-2" data-testid="lab-mobile-dept-nav">
              {departments.map((dept) => {
                const active = dept.key === currentDept;
                return (
                  <Link
                    key={dept.key}
                    href={deptRoute(envId, dept.key)}
                    data-testid={`drawer-dept-tab-${dept.key}`}
                    aria-label={dept.label}
                    aria-current={active ? "page" : undefined}
                    data-selected={active ? "true" : "false"}
                    title={dept.label}
                    onClick={() => {
                      setStoredLastDept(envId, dept.key);
                      setMobileSidebarOpen(false);
                    }}
                    className={cn(
                      "rounded-lg border h-9 w-9 transition inline-flex items-center justify-center",
                      active
                        ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text"
                        : "border-bm-border/70 text-bm-muted hover:bg-bm-surface/50 hover:text-bm-text"
                    )}
                  >
                    <DeptIcon deptKey={dept.key} size={15} />
                    <span className="sr-only">{dept.label}</span>
                  </Link>
                );
              })}
            </nav>
            <nav data-testid="lab-sidebar">
              <GroupedCapabilityNav
                envId={envId}
                currentDept={currentDept}
                pathname={pathname}
                groups={groupedCapabilities}
                collapsedGroups={collapsedGroups}
                onToggleGroup={toggleGroup}
                onNavigate={() => setMobileSidebarOpen(false)}
              />
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
