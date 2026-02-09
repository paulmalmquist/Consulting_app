"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getAllDepartments,
  getCatalogCapabilities,
  getTemplates,
  createBusiness,
  applyTemplate,
  applyCustom,
  Department,
  Capability,
  Template,
} from "@/lib/bos-api";

type Step = "create" | "choose" | "template-pick" | "template-review" | "custom-depts" | "custom-caps" | "custom-review" | "provisioning";

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
  const [step, setStep] = useState<Step>("create");

  // Business creation
  const [bizName, setBizName] = useState("");
  const [bizSlug, setBizSlug] = useState("");
  const [bizRegion, setBizRegion] = useState("us");

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

  // Auto-slug
  useEffect(() => {
    setBizSlug(
      bizName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    );
  }, [bizName]);

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
      const biz = await createBusiness(bizName, bizSlug, bizRegion);
      const businessId = biz.business_id;

      // Store for app context
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

      // Navigate to app - pick first department
      const firstDept = selectedTemplate
        ? selectedTemplate.departments[0]
        : Array.from(customDepts)[0];
      router.push(firstDept ? `/app/${firstDept}` : "/app");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Provisioning failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-start justify-center p-4 pt-8 sm:pt-16">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Business OS Setup</h1>
        <p className="text-slate-400 text-sm mb-8">Configure your business workspace</p>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-200 px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {/* STEP: Create Business */}
        {step === "create" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Create Your Business</h2>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Business Name</label>
              <input
                type="text"
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                placeholder="Acme Corp"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Slug</label>
              <input
                type="text"
                value={bizSlug}
                onChange={(e) => setBizSlug(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Region</label>
              <select
                value={bizRegion}
                onChange={(e) => setBizRegion(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="us">United States</option>
                <option value="eu">Europe</option>
                <option value="apac">Asia-Pacific</option>
              </select>
            </div>
            <button
              disabled={!bizName.trim()}
              onClick={() => setStep("choose")}
              className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* STEP: Choose setup path */}
        {step === "choose" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Choose Setup Path</h2>
            <p className="text-sm text-slate-400">Start from a template or build a custom configuration.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => setStep("template-pick")}
                className="border border-slate-700 rounded-lg p-4 text-left hover:border-sky-500 transition-colors"
              >
                <p className="font-semibold">Template</p>
                <p className="text-sm text-slate-400 mt-1">Pre-configured department bundles. Review &amp; toggle before provisioning.</p>
              </button>
              <button
                onClick={() => setStep("custom-depts")}
                className="border border-slate-700 rounded-lg p-4 text-left hover:border-sky-500 transition-colors"
              >
                <p className="font-semibold">Custom</p>
                <p className="text-sm text-slate-400 mt-1">Pick departments and capabilities individually.</p>
              </button>
            </div>
            <button
              onClick={() => setStep("create")}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              ← Back
            </button>
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
                  className={`w-full border rounded-lg p-4 text-left transition-colors ${
                    selectedTemplate?.key === tmpl.key
                      ? "border-sky-500 bg-slate-900"
                      : "border-slate-700 hover:border-slate-500"
                  }`}
                >
                  <p className="font-semibold">{tmpl.label}</p>
                  <p className="text-sm text-slate-400 mt-1">{tmpl.description}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tmpl.departments.map((dk) => {
                      const dept = allDepts.find((d) => d.key === dk);
                      return (
                        <span key={dk} className="text-xs bg-slate-800 px-2 py-0.5 rounded">
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
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              ← Back
            </button>
          </div>
        )}

        {/* STEP: Template review */}
        {step === "template-review" && selectedTemplate && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Review: {selectedTemplate.label}</h2>
            <p className="text-sm text-slate-400">Toggle departments and capabilities on/off before provisioning.</p>

            {/* Top bar preview */}
            <div className="bg-slate-900 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-2 uppercase">Top Bar Preview</p>
              <div className="flex flex-wrap gap-2">
                {allDepts
                  .filter((d) => templateDepts.has(d.key))
                  .map((d) => (
                    <span key={d.key} className="text-sm bg-slate-800 px-3 py-1 rounded-lg">
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
                    <div key={dept.key} className="border border-slate-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => {
                          const next = new Set(templateDepts);
                          if (enabled) next.delete(dept.key);
                          else next.add(dept.key);
                          setTemplateDepts(next);
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-900 transition-colors"
                      >
                        <span className="font-medium">
                          {iconFor(dept.icon)} {dept.label}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            enabled ? "bg-emerald-900 text-emerald-300" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {enabled ? "ON" : "OFF"}
                        </span>
                      </button>
                      {enabled && caps.length > 0 && (
                        <div className="border-t border-slate-800 px-4 py-2 space-y-1">
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
                                className="w-full flex items-center justify-between py-1.5 text-sm hover:bg-slate-900 px-2 rounded transition-colors"
                              >
                                <span className="text-slate-300">{cap.label}</span>
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded ${
                                    capEnabled ? "bg-emerald-900 text-emerald-300" : "bg-slate-800 text-slate-500"
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

            <button
              onClick={handleProvision}
              disabled={loading || templateDepts.size === 0}
              className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {loading ? "Provisioning..." : "Provision Business"}
            </button>
            <button
              onClick={() => setStep("template-pick")}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              ← Back
            </button>
          </div>
        )}

        {/* STEP: Custom - Department picker */}
        {step === "custom-depts" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Select Departments</h2>
            <p className="text-sm text-slate-400">Choose which departments to enable.</p>
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
                    className={`w-full flex items-center justify-between border rounded-lg px-4 py-3 transition-colors ${
                      selected ? "border-sky-500 bg-slate-900" : "border-slate-700 hover:border-slate-500"
                    }`}
                  >
                    <span>
                      {iconFor(dept.icon)} {dept.label}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        selected ? "bg-sky-900 text-sky-300" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {selected ? "Selected" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              disabled={customDepts.size === 0}
              onClick={() => setStep("custom-caps")}
              className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              Next: Capabilities
            </button>
            <button
              onClick={() => setStep("choose")}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              ← Back
            </button>
          </div>
        )}

        {/* STEP: Custom - Capabilities */}
        {step === "custom-caps" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Select Capabilities</h2>
            <p className="text-sm text-slate-400">Choose capabilities for each department.</p>
            {Array.from(customDepts).map((dk) => {
              const dept = allDepts.find((d) => d.key === dk);
              const caps = allCaps[dk] || [];
              return (
                <div key={dk} className="border border-slate-700 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-slate-900 font-medium text-sm">
                    {dept ? `${iconFor(dept.icon)} ${dept.label}` : dk}
                  </div>
                  <div className="px-4 py-2 space-y-1">
                    {caps.length === 0 && (
                      <p className="text-sm text-slate-500 py-1">Loading capabilities...</p>
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
                          className="w-full flex items-center justify-between py-1.5 text-sm hover:bg-slate-900 px-2 rounded transition-colors"
                        >
                          <span className="text-slate-300">{cap.label}</span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              selected ? "bg-sky-900 text-sky-300" : "bg-slate-800 text-slate-500"
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
            <button
              disabled={customCaps.size === 0}
              onClick={() => setStep("custom-review")}
              className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              Review Configuration
            </button>
            <button
              onClick={() => setStep("custom-depts")}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              ← Back
            </button>
          </div>
        )}

        {/* STEP: Custom - Review */}
        {step === "custom-review" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Review Custom Configuration</h2>

            <div className="bg-slate-900 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-2 uppercase">Top Bar Preview</p>
              <div className="flex flex-wrap gap-2">
                {allDepts
                  .filter((d) => customDepts.has(d.key))
                  .map((d) => (
                    <span key={d.key} className="text-sm bg-slate-800 px-3 py-1 rounded-lg">
                      {iconFor(d.icon)} {d.label}
                    </span>
                  ))}
              </div>
            </div>

            {Array.from(customDepts).map((dk) => {
              const dept = allDepts.find((d) => d.key === dk);
              const caps = (allCaps[dk] || []).filter((c) => customCaps.has(c.key));
              return (
                <div key={dk} className="border border-slate-700 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-slate-900 font-medium text-sm">
                    {dept ? `${iconFor(dept.icon)} ${dept.label}` : dk}
                  </div>
                  <div className="px-4 py-2 space-y-1">
                    {caps.map((cap) => (
                      <div key={cap.key} className="text-sm text-slate-300 py-1 px-2">
                        {cap.label}
                      </div>
                    ))}
                    {caps.length === 0 && (
                      <p className="text-sm text-slate-500 py-1">No capabilities selected</p>
                    )}
                  </div>
                </div>
              );
            })}

            <button
              onClick={handleProvision}
              disabled={loading}
              className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {loading ? "Provisioning..." : "Provision Business"}
            </button>
            <button
              onClick={() => setStep("custom-caps")}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
