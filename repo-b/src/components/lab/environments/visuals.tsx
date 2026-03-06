import {
  BarChart3,
  Building2,
  HardHat,
  HeartPulse,
  Layers,
  Scale,
  type LucideIcon,
} from "lucide-react";

import type { EnvironmentStatus } from "./constants";
import { humanIndustry, statusLabel } from "./constants";

type IndustryVisual = {
  icon: LucideIcon;
  label: string;
  testId: string;
};

type StatusVisual = {
  label: string;
  pillClass: string;
  dotClass: string;
};

function normalizeIndustry(industry?: string | null): string {
  return (industry || "").trim().toLowerCase();
}

export function getIndustryIcon(industry?: string | null): IndustryVisual {
  const key = normalizeIndustry(industry);
  if (key === "pds_command" || key === "pds") {
    return { icon: HardHat, label: "PDS Command", testId: "industry-icon-pds_command" };
  }
  if (key === "credit_risk_hub" || key === "credit") {
    return { icon: BarChart3, label: "Credit Risk Hub", testId: "industry-icon-credit_risk_hub" };
  }
  if (key === "legal_ops_command" || key === "legal_ops") {
    return { icon: Scale, label: "Legal Ops Command", testId: "industry-icon-legal_ops_command" };
  }
  if (key === "medical_office_backoffice" || key === "medical") {
    return { icon: HeartPulse, label: "Medical Office Backoffice", testId: "industry-icon-medical_office_backoffice" };
  }
  if (key === "real_estate" || key === "real_estate_pe" || key === "repe") {
    return { icon: Building2, label: "Real Estate", testId: "industry-icon-real_estate" };
  }
  if (key === "healthcare") {
    return { icon: HeartPulse, label: "Healthcare", testId: "industry-icon-healthcare" };
  }
  if (key === "legal") {
    return { icon: Scale, label: "Legal", testId: "industry-icon-legal" };
  }
  if (key === "construction") {
    return { icon: HardHat, label: "Construction", testId: "industry-icon-construction" };
  }
  return {
    icon: Layers,
    label: humanIndustry(industry) || "General",
    testId: "industry-icon-default",
  };
}

export function getStatusBadge(status: EnvironmentStatus): StatusVisual {
  if (status === "active") {
    return {
      label: statusLabel.active,
      pillClass: "border-emerald-400/30 bg-emerald-500/15 text-emerald-300",
      dotClass: "bg-emerald-400",
    };
  }
  if (status === "failed") {
    return {
      label: statusLabel.failed,
      pillClass: "border-red-400/30 bg-red-500/15 text-red-300",
      dotClass: "bg-red-400",
    };
  }
  if (status === "provisioning") {
    return {
      label: statusLabel.provisioning,
      pillClass: "border-amber-400/30 bg-amber-500/15 text-amber-300",
      dotClass: "bg-amber-400",
    };
  }
  return {
    label: statusLabel.archived,
    pillClass: "border-slate-400/30 bg-slate-500/15 text-slate-300",
    dotClass: "bg-slate-400",
  };
}

export function getHealthLabel(status: EnvironmentStatus): string {
  if (status === "active") return "Healthy";
  if (status === "failed") return "Degraded";
  if (status === "provisioning") return "Provisioning";
  return "Archived";
}

export function getFreshnessLabel(lastActivity?: string): string {
  if (!lastActivity) return "Unknown";
  const value = new Date(lastActivity).getTime();
  if (Number.isNaN(value)) return "Unknown";
  const daysOld = (Date.now() - value) / (1000 * 60 * 60 * 24);
  return daysOld <= 7 ? "Fresh" : "Stale";
}
