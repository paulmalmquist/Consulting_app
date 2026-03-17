"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, Loader2, PlusCircle } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { AvailableAsset } from "@/lib/bos-api";

interface AssetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableAssets: AvailableAsset[];
  onAddAssets: (assets: AvailableAsset[]) => Promise<void>;
}

export function AssetPickerDialog({
  open,
  onOpenChange,
  availableAssets,
  onAddAssets,
}: AssetPickerDialogProps) {
  const [search, setSearch] = useState("");
  const [filterFund, setFilterFund] = useState("");
  const [filterSector, setFilterSector] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const fundOptions = useMemo(() => {
    const names = new Set<string>();
    for (const a of availableAssets) {
      if (a.fund_name) names.add(a.fund_name);
    }
    return Array.from(names).sort();
  }, [availableAssets]);

  const sectorOptions = useMemo(() => {
    const types = new Set<string>();
    for (const a of availableAssets) {
      if (a.asset_type) types.add(a.asset_type);
    }
    return Array.from(types).sort();
  }, [availableAssets]);

  const filtered = useMemo(() => {
    let list = availableAssets;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          (a.asset_name || "").toLowerCase().includes(q) ||
          (a.fund_name || "").toLowerCase().includes(q),
      );
    }
    if (filterFund) list = list.filter((a) => a.fund_name === filterFund);
    if (filterSector) list = list.filter((a) => a.asset_type === filterSector);
    return list;
  }, [availableAssets, search, filterFund, filterSector]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const filteredIds = new Set(filtered.map((a) => a.asset_id));
    const allSelected = filtered.every((a) => selected.has(a.asset_id));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of filteredIds) next.delete(id);
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...filteredIds]));
    }
  };

  const handleAdd = useCallback(async () => {
    const assets = availableAssets.filter((a) => selected.has(a.asset_id));
    if (assets.length === 0) return;
    setAdding(true);
    try {
      await onAddAssets(assets);
      setSelected(new Set());
      setSearch("");
      setFilterFund("");
      setFilterSector("");
      onOpenChange(false);
    } finally {
      setAdding(false);
    }
  }, [selected, availableAssets, onAddAssets, onOpenChange]);

  const handleClose = (v: boolean) => {
    if (!v) {
      setSelected(new Set());
      setSearch("");
      setFilterFund("");
      setFilterSector("");
    }
    onOpenChange(v);
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.asset_id));

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      title="Add Assets to Scenario"
      description={`${availableAssets.length} available assets`}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => handleClose(false)} disabled={adding}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleAdd} disabled={adding || selected.size === 0}>
            {adding ? <Loader2 size={13} className="mr-1 animate-spin" /> : <PlusCircle size={13} className="mr-1" />}
            Add {selected.size} Asset{selected.size !== 1 ? "s" : ""}
          </Button>
        </>
      }
    >
      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-bm-muted" />
          <input
            className="w-full rounded border border-bm-border/50 bg-bm-surface/10 py-1.5 pl-7 pr-2 text-xs outline-none transition-colors focus:border-bm-border-strong/70"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        {fundOptions.length > 1 && (
          <select
            className="rounded border border-bm-border/50 bg-bm-surface/10 px-1.5 py-1.5 text-xs outline-none"
            value={filterFund}
            onChange={(e) => setFilterFund(e.target.value)}
          >
            <option value="">All Funds</option>
            {fundOptions.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        )}
        {sectorOptions.length > 1 && (
          <select
            className="rounded border border-bm-border/50 bg-bm-surface/10 px-1.5 py-1.5 text-xs outline-none"
            value={filterSector}
            onChange={(e) => setFilterSector(e.target.value)}
          >
            <option value="">All Sectors</option>
            {sectorOptions.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        )}
      </div>

      {/* Asset table */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-xs text-bm-muted2">
          {availableAssets.length === 0 ? "No assets available." : "No matching assets."}
        </p>
      ) : (
        <div className="max-h-[400px] overflow-auto rounded border border-bm-border/30">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bm-surface/20">
              <tr className="border-b border-bm-border/30 text-left text-[9px] uppercase tracking-[0.1em] text-bm-muted">
                <th className="w-7 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    className="rounded border-bm-border/50 bg-transparent"
                  />
                </th>
                <th className="px-3 py-1.5 font-medium">Asset Name</th>
                <th className="px-3 py-1.5 font-medium">Sector</th>
                <th className="px-3 py-1.5 font-medium">Fund</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.asset_id}
                  className={`border-b border-bm-border/15 cursor-pointer transition-colors hover:bg-bm-surface/15 ${
                    selected.has(a.asset_id) ? "bg-bm-accent/5" : ""
                  }`}
                  onClick={() => toggleSelect(a.asset_id)}
                >
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(a.asset_id)}
                      onChange={() => toggleSelect(a.asset_id)}
                      className="rounded border-bm-border/50 bg-transparent"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-bm-text">
                    {a.asset_name || a.asset_id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 text-bm-muted2 capitalize">
                    {a.asset_type?.replace(/_/g, " ") || "\u2014"}
                  </td>
                  <td className="px-3 py-2 text-bm-muted2">{a.fund_name || "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
