"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  getAllDepartments,
  getCatalogCapabilities,
  getTemplates,
  applyTemplate,
  applyCustom,
  Department,
  Capability,
  Template,
} from "@/lib/bos-api";
import { useEnv } from "@/components/EnvProvider";

type Step = "choose" | "template-pick" | "template-review" | "custom-depts" | "custom-caps" | "custom-review" | "provisioning";

const ICON_MAP: Record<string, string> = {
  "dollar-sign": "$",
  settings: "⚙",
  users: "👤",
  "trending-up": "📈",
  shield: "🛡",
  cpu: "💻",
  megaphone: "📣",
  folder: "📁",
};

function iconFor(icon: string) {
  return ICON_MAP[icon] || "📁";
}

export default function OnboardingPage() {
  const router = useRouter();
  const { selectedEnv } = useEnv();
  const [step, setStep] = useState<Step>("choose");

  // Catalog data
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [allCaps, setAllCaps] = useState<Record<string, Capability[]>>({});
  const [templates, setTemplates] = useState<Template[]>([]);

  // Template flow
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateDepts, setTemplateDepts] = useState<Set<string>>(new Set());
  const [templateCaps, setTemplateCaps] = useState<Set<string>>(new Set());

  // Custom flow
  const [customDepts, setCustomDepts] = useState<Set<string>>(new Set());
  const [customCaps, setCustomCaps] = useState<Set<string>>(new Set());

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load catalog
  useEffect(() => {
    getAllDepartments().then(setAllDepts).catch(() => {});
    getTemplates().then(setTemplates).catch(() => {});
  }, []);

  const loadCapsForDept = useCallback(
    async (deptKey: string) => {
      if (allCaps[deptKey]) return;
      const caps = await getCatalogCapabilities(deptKey);
      setAllCaps((prev) => ({ ...prev, [deptKey]: caps }));
    },
    [allCaps]
  );

  // When template is selected, pre-populate toggles
  useEffect(() => {
    if (!selectedTemplate) return;
    setTemplateDepts(new Set(selectedTemplate.departments));
    // Load caps for all template departments
    selectedTemplate.departments.forEach(loadCapsForDept);
  }, [selectedTemplate, loadCapsForDept]);

  // When template caps loaded, enable all from template
  useEffect(() => {
    if (!selectedTemplate) return;
    const capSet = new Set<string>();
    selectedTemplate.departments.forEach((dk) => {
      (allCaps[dk] || []).forEach((c) => capSet.add(c.key));
    });
    setTemplateCaps(capSet);
  }, [selectedTemplate, allCaps]);

  // Load caps for custom selected depts
  useEffect(() => {
    customDepts.forEach(loadCapsForDept);
  }, [customDepts, loadCapsForDept]);

  async function handleProvision() {
    setLoading(true);
    setError("");
    try {
      // Business is auto-created when the environment is provisioned.
      // Use the business_id from the current environment context.
      const businessId = selectedEnv?.business_id;
      if (!businessId) {
        setError("No active environment found. Please select an environment first.");
        return;
      }

      // Store for app context (legacy compatibility)
      localStorage.setItem("bos_business_id", businessId);

      if (selectedTemplate) {
        await applyTemplate(
          businessId,
          selectedTemplate.key,
          Array.from(templateDepts),
          Array.from(templateCaps)
        );
      } else {
        await applyCustom(businessId, Array.from(customDepts), Array.from(customCaps));
      }

      const envId = selectedEnv?.env_id;
      router.push(envId ? `/lab/env/${envId}` : "/lab/environments");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Provisioning failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-start justify-center p-4 pt-8 sm:pt-16">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Business OS Setup</h1>
        <p className="text-bm-muted text-sm mb-8">Configure your business workspace</p>

        {error && (
          <div className="bg-bm-danger/15 border border-bm-danger/30 text-bm-text px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {/* STEP: Choose setup path */}
        {step === "choose" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Choose Setup Path</h2>
            <p className="text-sm text-bm-muted">Start from a template or build a custom configuration.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => setStep("template-pick")}
                className="bm-glass-interactive rounded-xl p-4 text-left border border-bm-border/70 hover:border-bm-accent/35"
                data-testid="onboarding-path-template"
              >
                <p className="font-semibold">Template</p>
                <p className="text-sm text-bm-muted mt-1">Pre-configured department bundles. Review &amp; toggle before provisioning.</p>
              </button>
              <button
                onClick={() => setStep("custom-depts")}
                className="bm-glass-interactive rounded-xl p-4 text-left border border-bm-border/70 hover:border-bm-accent/35"
                data-testid="onboarding-path-custom"
              >
                <p className="font-semibold">Custom</p>
                <p className="text-sm text-bm-muted mt-1">Pick departments and capabilities individually.</p>
              </button>
            </div>
          </div>
        )}

        {/* STEP: Template picker */}
        {step === "template-pick" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Select a Template</h2>
            <div className="space-y-3">
              {templates.map((tmpl) => (
                <button
                  key={tmpl.key}
                  onClick={() => {
                    setSelectedTemplate(tmpl);
                    setStep("template-review");
                  }}
                  data-testid={`template-card-${tmpl.key}`}
                  className={`w-full bm-glass-interactive border rounded-xl p-4 text-left transition-colors ${
                    selectedTemplate?.key === tmpl.key
                      ? "border-bm-accent/35"
                      : "border-bm-border/70 hover:border-bm-borderStrong"
                  }`}
                >
                  <p className="font-semibold">{tmpl.label}</p>
                  <p className="text-sm text-bm-muted mt-1">{tmpl.description}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tmpl.departments.map((dk) => {
                      const dept = allDepts.find((d) => d.key === dk);
                      return (
                        <span
                          key={dk}
                          className="text-xs bg-bm-surface2/60 border border-bm-border/60 px-2 py-0.5 rounded"
                        >
                          {dept ? `${iconFor(dept.icon)} ${dept.label}` : dk}
                        </span>
                      );
                    })}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep("choose")}
              className="text-sm text-bm-muted hover:text-bm-text"
            >
              ← Back
            </button>
          </div>
        )}

        {/* STEP: Template review */}
        {step === "template-review" && selectedTemplate && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Review: {selectedTemplate.label}</h2>
            <p className="text-sm text-bm-muted">Toggle departments and capabilities on/off before provisioning.</p>

            {/* Top bar preview */}
            <div className="bm-glass rounded-lg p-3">
              <p className="text-xs text-bm-muted2 mb-2 uppercase tracking-[0.14em]">Top Bar Preview</p>
              <div className="flex flex-wrap gap-2">
                {allDepts
                  .filter((d) => templateDepts.has(d.key))
                  .map((d) => (
                    <span key={d.key} className="text-sm bg-bm-surface2/60 border border-bm-border/60 px-3 py-1 rounded-lg">
                      {iconFor(d.icon)} {d.label}
                    </span>
                  ))}
              </div>
            </div>

            {/* Department/capability tree */}
            <div className="space-y-3">
              {allDepts
                .filter((d) => selectedTemplate.departments.includes(d.key))
                .map((dept) => {
                  const enabled = templateDepts.has(dept.key);
                  const caps = allCaps[dept.key] || [];
                  return (
                    <div key={dept.key} className="bm-glass rounded-lg overflow-hidden">
                      <button
                        onClick={() => {
                          const next = new Set(templateDepts);
                          if (enabled) next.delete(dept.key);
                          else next.add(dept.key);
                          setTemplateDepts(next);
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-bm-surface/35 transition"
                      >
                        <span className="font-medium">
                          {iconFor(dept.icon)} {dept.label}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${
                            enabled
                              ? "bg-bm-success/15 text-bm-text border-bm-success/35"
                              : "bg-bm-surface2/50 text-bm-muted border-bm-border/60"
                          }`}
                        >
                          {enabled ? "ON" : "OFF"}
                        </span>
                      </button>
                      {enabled && caps.length > 0 && (
                        <div className="border-t border-bm-border/70 px-4 py-2 space-y-1">
                          {caps.map((cap) => {
                            const capEnabled = templateCaps.has(cap.key);
                            return (
                              <button
                                key={cap.key}
                                onClick={() => {
                                  const next = new Set(templateCaps);
                                  if (capEnabled) next.delete(cap.key);
                                  else next.add(cap.key);
                                  setTemplateCaps(next);
                                }}
                                className="w-full flex items-center justify-between py-1.5 text-sm hover:bg-bm-surface/30 px-2 rounded transition"
                              >
                                <span className="text-bm-text">{cap.label}</span>
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded border ${
                                    capEnabled
                                      ? "bg-bm-success/15 text-bm-text border-bm-success/35"
                                      : "bg-bm-surface2/50 text-bm-muted border-bm-border/60"
                                  }`}
                                >
                                  {capEnabled ? "ON" : "OFF"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            <Button
              onClick={handleProvision}
              disabled={loading || templateDepts.size === 0}
              className="w-full"
              data-testid="onboarding-provision"
            >
              {loading ? "Provisioning..." : "Provision Business"}
            </Button>
            <button
              onClick={() => setStep("template-pick")}
              className="text-sm text-bm-muted hover:text-bm-text"
            >
              ← Back
            </button>
          </div>
        )}

        {/* STEP: Custom - Department picker */}
        {step === "custom-depts" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Select Departments</h2>
            <p className="text-sm text-bm-muted">Choose which departments to enable.</p>
            <div className="space-y-2">
              {allDepts.map((dept) => {
                const selected = customDepts.has(dept.key);
                return (
                  <button
                    key={dept.key}
                    onClick={() => {
                      const next = new Set(customDepts);
                      if (selected) next.delete(dept.key);
                      else next.add(dept.key);
                      setCustomDepts(next);
                    }}
                    className={`w-full flex items-center justify-between bm-glass-interactive border rounded-xl px-4 py-3 transition-colors ${
                      selected
                        ? "border-bm-accent/35"
                        : "border-bm-border/70 hover:border-bm-borderStrong"
                    }`}
                    data-testid={`onboarding-custom-dept-${dept.key}`}
                  >
                    <span>
                      {iconFor(dept.icon)} {dept.label}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded border ${
                        selected
                          ? "bg-bm-accent/15 text-bm-text border-bm-accent/35"
                          : "bg-bm-surface2/50 text-bm-muted border-bm-border/60"
                      }`}
                    >
                      {selected ? "Selected" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button
              disabled={customDepts.size === 0}
              onClick={() => setStep("custom-caps")}
              className="w-full"
            >
              Next: Capabilities
            </Button>
            <button
              onClick={() => setStep("choose")}
              className="text-sm text-bm-muted hover:text-bm-text"
            >
              ← Back
            </button>
          </div>
        )}

        {/* STEP: Custom - Capabilities */}
        {step === "custom-caps" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Select Capabilities</h2>
            <p className="text-sm text-bm-muted">Choose capabilities for each department.</p>
            {Array.from(customDepts).map((dk) => {
              const dept = allDepts.find((d) => d.key === dk);
              const caps = allCaps[dk] || [];
              return (
                <div key={dk} className="bm-glass rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-bm-bg/15 font-medium text-sm border-b border-bm-border/60">
                    {dept ? `${iconFor(dept.icon)} ${dept.label}` : dk}
                  </div>
                  <div className="px-4 py-2 space-y-1">
                    {caps.length === 0 && (
                      <p className="text-sm text-bm-muted2 py-1">Loading capabilities...</p>
                    )}
                    {caps.map((cap) => {
                      const selected = customCaps.has(cap.key);
                      return (
                        <button
                          key={cap.key}
                          onClick={() => {
                            const next = new Set(customCaps);
                            if (selected) next.delete(cap.key);
                            else next.add(cap.key);
                            setCustomCaps(next);
                          }}
                          className="w-full flex items-center justify-between py-1.5 text-sm hover:bg-bm-surface/30 px-2 rounded transition"
                          data-testid={`onboarding-custom-cap-${cap.key}`}
                        >
                          <span className="text-bm-text">{cap.label}</span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded border ${
                              selected
                                ? "bg-bm-accent/15 text-bm-text border-bm-accent/35"
                                : "bg-bm-surface2/50 text-bm-muted border-bm-border/60"
                            }`}
                          >
                            {selected ? "ON" : "OFF"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <Button
              disabled={customCaps.size === 0}
              onClick={() => setStep("custom-review")}
              className="w-full"
            >
              Review Configuration
            </Button>
            <button
              onClick={() => setStep("custom-depts")}
              className="text-sm text-bm-muted hover:text-bm-text"
            >
              ← Back
            </button>
          </div>
        )}

        {/* STEP: Custom - Review */}
        {step === "custom-review" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Review Custom Configuration</h2>

            <div className="bm-glass rounded-lg p-3">
              <p className="text-xs text-bm-muted2 mb-2 uppercase tracking-[0.14em]">Top Bar Preview</p>
              <div className="flex flex-wrap gap-2">
                {allDepts
                  .filter((d) => customDepts.has(d.key))
                  .map((d) => (
                    <span key={d.key} className="text-sm bg-bm-surface2/60 border border-bm-border/60 px-3 py-1 rounded-lg">
                      {iconFor(d.icon)} {d.label}
                    </span>
                  ))}
              </div>
            </div>

            {Array.from(customDepts).map((dk) => {
              const dept = allDepts.find((d) => d.key === dk);
              const caps = (allCaps[dk] || []).filter((c) => customCaps.has(c.key));
              return (
                <div key={dk} className="bm-glass rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-bm-bg/15 font-medium text-sm border-b border-bm-border/60">
                    {dept ? `${iconFor(dept.icon)} ${dept.label}` : dk}
                  </div>
                  <div className="px-4 py-2 space-y-1">
                    {caps.map((cap) => (
                      <div key={cap.key} className="text-sm text-bm-text py-1 px-2">
                        {cap.label}
                      </div>
                    ))}
                    {caps.length === 0 && (
                      <p className="text-sm text-bm-muted2 py-1">No capabilities selected</p>
                    )}
                  </div>
                </div>
              );
            })}

            <Button
              onClick={handleProvision}
              disabled={loading}
              className="w-full"
              data-testid="onboarding-provision"
            >
              {loading ? "Provisioning..." : "Provision Business"}
            </Button>
            <button
              onClick={() => setStep("custom-caps")}
              className="text-sm text-bm-muted hover:text-bm-text"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
