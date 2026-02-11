"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import { cn } from "@/lib/cn";
import {
  getDefaultDepartmentForIndustry,
  getEnabledDepartmentsForIndustry,
  type LabDepartmentKey,
} from "@/lib/lab/DepartmentRegistry";
import {
  getCapabilitiesForDepartment,
  type LabCapabilityMeta,
  groupCapabilities,
  type LabCapabilityCategory,
} from "@/lib/lab/CapabilityRegistry";
import { DeptIcon } from "@/components/lab/LabIcons";
import {
  type LabRole,
  filterCapabilitiesByRole,
  filterDepartmentsByRole,
  getStoredLabRole,
} from "@/lib/lab/rbac";
import { logLabAuditEvent } from "@/lib/lab/clientAudit";

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

function parseCapabilityFromPath(pathname: string, envId: string): string | null {
  const prefix = `/lab/env/${envId}/`;
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
}: {
  envId: string;
  currentDept: LabDepartmentKey;
  pathname: string;
  groups: Record<LabCapabilityCategory, LabCapabilityMeta[]>;
  collapsedGroups: Record<LabCapabilityCategory, boolean>;
  onToggleGroup: (group: LabCapabilityCategory) => void;
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
                      href={`/lab/env/${envId}/${currentDept}/capability/${cap.key}`}
                      data-testid={`cap-link-${cap.key}`}
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

  const industry = selectedEnv?.env_id === envId ? selectedEnv.industry : undefined;
  const departments = useMemo(() => {
    const enabled = getEnabledDepartmentsForIndustry(industry);
    return filterDepartmentsByRole(role, enabled);
  }, [industry, role]);
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

  useEffect(() => {
    if (selectedEnv?.env_id !== envId) {
      selectEnv(envId);
    }
  }, [envId, selectedEnv?.env_id, selectEnv]);

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
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-3">
        <div className="mb-3 rounded-lg border border-bm-border/60 bg-bm-surface/25 px-3 py-2 text-sm text-bm-muted">
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

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
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
                    "rounded-lg border px-2.5 py-1.5 transition inline-flex items-center gap-1.5",
                    active
                      ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text"
                      : "border-bm-border/70 text-bm-muted hover:bg-bm-surface/50 hover:text-bm-text"
                  )}
                >
                  <DeptIcon deptKey={dept.key} size={16} />
                  <span className="text-xs font-medium hidden sm:inline">{dept.label}</span>
                </Link>
              );
            })}
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

      <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
        <aside
          className="hidden lg:block rounded-xl border border-bm-border/70 bg-bm-surface/30 p-3"
          data-testid="lab-sidebar"
        >
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 px-2 pb-2">
            {currentDeptMeta?.label} Functions
          </p>
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
            <nav data-testid="lab-sidebar">
              <GroupedCapabilityNav
                envId={envId}
                currentDept={currentDept}
                pathname={pathname}
                groups={groupedCapabilities}
                collapsedGroups={collapsedGroups}
                onToggleGroup={toggleGroup}
              />
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
