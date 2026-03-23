"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { previewAsset } from "@/lib/bos-api";
import type { AssetPreview } from "@/lib/bos-api";

const DEBOUNCE_MS = 800;

/**
 * Debounced preview hook for the Asset Modeling Drawer.
 * Calls the lightweight preview endpoint whenever drafts change.
 */
export function useAssetPreview(
  scenarioId: string | null,
  assetId: string | null,
  drafts: Record<string, string>,
  savedOverrideCount: number,
) {
  const [preview, setPreview] = useState<AssetPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPreview = useCallback(async () => {
    if (!scenarioId || !assetId) return;

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await previewAsset(scenarioId, assetId);
      setPreview(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [scenarioId, assetId]);

  // Debounced trigger on draft changes
  useEffect(() => {
    if (!scenarioId || !assetId) {
      setPreview(null);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fetchPreview, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scenarioId, assetId, drafts, savedOverrideCount, fetchPreview]);

  // Reset when asset changes
  useEffect(() => {
    setPreview(null);
    setError(null);
  }, [assetId]);

  return { preview, loading, error };
}
