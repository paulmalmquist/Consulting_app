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
import { getCapabilitiesForDepartment } from "@/lib/lab/CapabilityRegistry";

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

export default function LabEnvironmentShell({ envId, children }: Props) {
  const pathname = usePathname();
  const { selectedEnv, selectEnv } = useEnv();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const mobileSidebarRef = useRef<HTMLDivElement>(null);

  const industry = selectedEnv?.env_id === envId ? selectedEnv.industry : undefined;
  const departments = useMemo(() => getEnabledDepartmentsForIndustry(industry), [industry]);
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

  const capabilities = currentDept ? getCapabilitiesForDepartment(currentDept) : [];

  useEffect(() => {
    if (selectedEnv?.env_id !== envId) {
      selectEnv(envId);
    }
  }, [envId, selectedEnv?.env_id, selectEnv]);

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

  if (!currentDept) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-4">
        No department configuration found for this environment.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {departments.map((dept) => {
              const active = dept.key === currentDept;
              return (
                <Link
                  key={dept.key}
                  href={`/lab/env/${envId}/${dept.key}`}
                  data-testid={`dept-tab-${dept.key}`}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition",
                    active
                      ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text"
                      : "border-bm-border/70 text-bm-muted hover:bg-bm-surface/50"
                  )}
                >
                  {dept.label}
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

      <div className="grid gap-4 lg:grid-cols-[240px,1fr]">
        <aside
          className="hidden lg:block rounded-xl border border-bm-border/70 bg-bm-surface/30 p-3"
          data-testid="lab-sidebar"
        >
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 px-2 pb-2">
            {departments.find((dept) => dept.key === currentDept)?.label} Functions
          </p>
          <nav className="space-y-1.5">
            {capabilities.map((cap) => {
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
          </nav>
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
            className="absolute left-0 top-0 h-full w-72 max-w-[88vw] border-r border-bm-border/70 bg-bm-bg/90 p-4"
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
            <nav className="space-y-1.5" data-testid="lab-sidebar">
              {capabilities.map((cap) => (
                <Link
                  key={`${cap.key}-mobile`}
                  href={`/lab/env/${envId}/${currentDept}/capability/${cap.key}`}
                  data-testid={`cap-link-${cap.key}`}
                  className="block rounded-lg border border-transparent px-3 py-2 text-sm text-bm-muted hover:border-bm-border/70 hover:bg-bm-surface/45"
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
