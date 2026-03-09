"use client";

import React, { useCallback, useState } from "react";

/* --------------------------------------------------------------------------
 * Props
 * -------------------------------------------------------------------------- */
interface Props {
  dashboardId?: string;
  dashboardName: string;
  isEditing: boolean;
  onToggleEdit: () => void;
  onSave: (name: string) => void;
  onRename: (name: string) => void;
  saving: boolean;
}

/* --------------------------------------------------------------------------
 * Component
 * -------------------------------------------------------------------------- */
export default function DashboardToolbar({
  dashboardId,
  dashboardName,
  isEditing,
  onToggleEdit,
  onSave,
  onRename,
  saving,
}: Props) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(dashboardName);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [subEmail, setSubEmail] = useState("");
  const [subFreq, setSubFreq] = useState("weekly");

  const handleRename = useCallback(() => {
    if (nameInput.trim()) {
      onRename(nameInput.trim());
      setIsRenaming(false);
    }
  }, [nameInput, onRename]);

  const handleSubscribe = useCallback(async () => {
    if (!dashboardId || !subEmail.trim()) return;
    try {
      await fetch(`/api/re/v2/dashboards/${dashboardId}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriber: subEmail.trim(),
          frequency: subFreq,
          delivery_format: "pdf",
        }),
      });
      setShowSubscribe(false);
      setSubEmail("");
    } catch {
      // silent
    }
  }, [dashboardId, subEmail, subFreq]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Left: name */}
      <div className="flex items-center gap-3">
        {isRenaming ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold dark:border-white/10 dark:bg-white/[0.03]"
              autoFocus
            />
            <button type="button" onClick={handleRename} className="text-xs text-bm-accent font-medium">Save</button>
            <button type="button" onClick={() => setIsRenaming(false)} className="text-xs text-bm-muted2">Cancel</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setNameInput(dashboardName); setIsRenaming(true); }}
            className="text-lg font-semibold text-bm-text hover:text-bm-accent transition-colors"
            title="Click to rename"
          >
            {dashboardName}
          </button>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {/* Edit mode toggle */}
        <button
          type="button"
          onClick={onToggleEdit}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            isEditing
              ? "border-bm-accent bg-bm-accent/10 text-bm-accent"
              : "border-slate-200 text-bm-muted2 hover:text-bm-text dark:border-white/10"
          }`}
        >
          {isEditing ? "Done Editing" : "Edit Layout"}
        </button>

        {/* Export dropdown */}
        {dashboardId && (
          <div className="relative group">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-bm-muted2 hover:text-bm-text dark:border-white/10"
            >
              Export
            </button>
            <div className="absolute right-0 top-full mt-1 z-20 hidden group-hover:block rounded-lg border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-900">
              <a
                href={`/api/re/v2/dashboards/${dashboardId}/export?format=csv`}
                download
                className="block px-4 py-2 text-xs text-bm-text hover:bg-slate-50 dark:hover:bg-white/[0.05]"
              >
                CSV
              </a>
              <a
                href={`/api/re/v2/dashboards/${dashboardId}/export?format=json`}
                download
                className="block px-4 py-2 text-xs text-bm-text hover:bg-slate-50 dark:hover:bg-white/[0.05]"
              >
                JSON
              </a>
            </div>
          </div>
        )}

        {/* Subscribe */}
        {dashboardId && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSubscribe(!showSubscribe)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-bm-muted2 hover:text-bm-text dark:border-white/10"
            >
              Subscribe
            </button>
            {showSubscribe && (
              <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-lg border border-slate-200 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-slate-900">
                <p className="text-xs font-medium text-bm-text mb-2">Schedule recurring delivery</p>
                <input
                  type="email"
                  value={subEmail}
                  onChange={(e) => setSubEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.03]"
                />
                <select
                  value={subFreq}
                  onChange={(e) => setSubFreq(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={!subEmail.trim()}
                  className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-950"
                >
                  Subscribe
                </button>
              </div>
            )}
          </div>
        )}

        {/* Save */}
        <button
          type="button"
          onClick={() => onSave(dashboardName)}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
        >
          {saving ? "Saving..." : dashboardId ? "Update" : "Save Dashboard"}
        </button>
      </div>
    </div>
  );
}
