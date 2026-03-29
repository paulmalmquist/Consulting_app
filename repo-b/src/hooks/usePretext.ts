"use client";

/**
 * Pretext integration hooks for Winston chat workspace.
 *
 * Uses @chenglou/pretext for pure-TypeScript text measurement that bypasses
 * DOM layout reflow entirely. Two-phase design:
 *   prepare(text, font) — one-time segmentation + canvas measurement (~0.04ms)
 *   layout(prepared, maxWidth, lineHeight) — pure arithmetic (~0.0002ms)
 *
 * This module provides three hooks:
 *   usePretextHeight — compute pixel height for a text block (virtualization)
 *   usePretextShrinkwrap — compute tightest bubble width (visual polish)
 *   usePretextComposerHeight — reflow-free textarea auto-resize
 */

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import {
  prepare,
  prepareWithSegments,
  layout,
  walkLineRanges,
  type PreparedText,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

// ---------------------------------------------------------------------------
// Constants matching Winston's chat typography
// ---------------------------------------------------------------------------

/** Body font used by Winston chat — must be a named font, not system-ui */
export const CHAT_FONT = '13px "Inter", sans-serif';
/** Tailwind leading-relaxed at 13px = 13 * 1.625 ≈ 21.1px */
export const CHAT_LINE_HEIGHT = 21;

/** Composer uses the same font/size */
export const COMPOSER_FONT = '13px "Inter", sans-serif';
export const COMPOSER_LINE_HEIGHT = 21;

// ---------------------------------------------------------------------------
// Prepared text caches — keyed by content + font
// ---------------------------------------------------------------------------

const preparedCache = new Map<string, PreparedText>();
const preparedWithSegmentsCache = new Map<string, PreparedTextWithSegments>();

function getCacheKey(text: string, font: string): string {
  return `${font}::${text}`;
}

function getPrepared(text: string, font: string): PreparedText {
  const key = getCacheKey(text, font);
  let p = preparedCache.get(key);
  if (!p) {
    p = prepare(text, font);
    preparedCache.set(key, p);
  }
  return p;
}

function getPreparedWithSegments(
  text: string,
  font: string
): PreparedTextWithSegments {
  const key = getCacheKey(text, font);
  let p = preparedWithSegmentsCache.get(key);
  if (!p) {
    p = prepareWithSegments(text, font);
    preparedWithSegmentsCache.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Cache eviction — prevent unbounded growth in long sessions
// ---------------------------------------------------------------------------

const MAX_CACHE_SIZE = 2000;

function evictIfNeeded(): void {
  if (preparedCache.size > MAX_CACHE_SIZE) {
    // Drop oldest half (Map preserves insertion order)
    const toDelete = Math.floor(MAX_CACHE_SIZE / 2);
    let count = 0;
    for (const key of preparedCache.keys()) {
      if (count >= toDelete) break;
      preparedCache.delete(key);
      count++;
    }
  }
  if (preparedWithSegmentsCache.size > MAX_CACHE_SIZE) {
    const toDelete = Math.floor(MAX_CACHE_SIZE / 2);
    let count = 0;
    for (const key of preparedWithSegmentsCache.keys()) {
      if (count >= toDelete) break;
      preparedWithSegmentsCache.delete(key);
      count++;
    }
  }
}

// ---------------------------------------------------------------------------
// measureMessageHeight — the core function for virtualization
// ---------------------------------------------------------------------------

/**
 * Compute the pixel height of a text block without touching the DOM.
 * Call on every resize — layout() is pure arithmetic (~0.0002ms).
 */
export function measureTextHeight(
  text: string,
  maxWidth: number,
  font: string = CHAT_FONT,
  lineHeight: number = CHAT_LINE_HEIGHT
): number {
  if (!text.trim()) return 0;
  const prepared = getPrepared(text, font);
  return layout(prepared, maxWidth, lineHeight).height;
}

/**
 * Compute the pixel height and line count for a text block.
 */
export function measureTextLayout(
  text: string,
  maxWidth: number,
  font: string = CHAT_FONT,
  lineHeight: number = CHAT_LINE_HEIGHT
): { height: number; lineCount: number } {
  if (!text.trim()) return { height: 0, lineCount: 0 };
  const prepared = getPrepared(text, font);
  return layout(prepared, maxWidth, lineHeight);
}

// ---------------------------------------------------------------------------
// findShrinkwrapWidth — binary search for tightest bubble width
// ---------------------------------------------------------------------------

/**
 * Find the narrowest width that doesn't increase line count beyond what
 * maxWidth produces. This is the core of pretext's bubbles demo.
 *
 * Returns { tightWidth, lineCount, maxLineWidth } where tightWidth is the
 * pixel width to set on the bubble container.
 */
export function findShrinkwrapWidth(
  text: string,
  maxWidth: number,
  font: string = CHAT_FONT,
  lineHeight: number = CHAT_LINE_HEIGHT
): { tightWidth: number; lineCount: number; maxLineWidth: number } {
  if (!text.trim()) return { tightWidth: 0, lineCount: 0, maxLineWidth: 0 };

  const prepared = getPreparedWithSegments(text, font);

  // Get baseline line count at full width
  const baseline = layout(prepared, maxWidth, lineHeight);
  if (baseline.lineCount <= 1) {
    // Single line — shrinkwrap to actual text width
    let maxLineWidth = 0;
    walkLineRanges(prepared, maxWidth, (line) => {
      if (line.width > maxLineWidth) maxLineWidth = line.width;
    });
    return {
      tightWidth: Math.ceil(maxLineWidth),
      lineCount: 1,
      maxLineWidth,
    };
  }

  // Binary search for the narrowest width that produces the same line count
  let lo = 1;
  let hi = Math.max(1, Math.ceil(maxWidth));

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const midResult = layout(prepared, mid, lineHeight);
    if (midResult.lineCount <= baseline.lineCount) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  // Collect the actual max line width at the tight width
  let maxLineWidth = 0;
  walkLineRanges(prepared, lo, (line) => {
    if (line.width > maxLineWidth) maxLineWidth = line.width;
  });

  evictIfNeeded();

  return {
    tightWidth: Math.ceil(maxLineWidth),
    lineCount: baseline.lineCount,
    maxLineWidth,
  };
}

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

/**
 * Hook: compute the height of a message for virtualizer sizing.
 *
 * @param text - The message text content
 * @param maxWidth - Container width in pixels
 * @param extraHeight - Additional height for padding, avatar row, action buttons, etc.
 * @param font - CSS font string (defaults to CHAT_FONT)
 * @param lineHeight - Line height in pixels (defaults to CHAT_LINE_HEIGHT)
 */
export function usePretextHeight(
  text: string,
  maxWidth: number,
  extraHeight: number = 0,
  font: string = CHAT_FONT,
  lineHeight: number = CHAT_LINE_HEIGHT
): number {
  return useMemo(() => {
    if (maxWidth <= 0) return extraHeight;
    return measureTextHeight(text, maxWidth, font, lineHeight) + extraHeight;
  }, [text, maxWidth, extraHeight, font, lineHeight]);
}

/**
 * Hook: compute the tightest bubble width for a message.
 *
 * @param text - The message text content
 * @param maxWidth - Maximum bubble width (e.g., 85% of container)
 * @param paddingH - Horizontal padding inside the bubble (px-3 = 12px each side)
 * @param enabled - Whether to compute shrinkwrap (false during streaming)
 */
export function usePretextShrinkwrap(
  text: string,
  maxWidth: number,
  paddingH: number = 24, // px-3 = 12px * 2
  enabled: boolean = true
): number | undefined {
  return useMemo(() => {
    if (!enabled || maxWidth <= 0 || !text.trim()) return undefined;
    const contentMaxWidth = maxWidth - paddingH;
    if (contentMaxWidth <= 0) return undefined;
    const { tightWidth } = findShrinkwrapWidth(text, contentMaxWidth);
    return tightWidth + paddingH;
  }, [text, maxWidth, paddingH, enabled]);
}

/**
 * Hook: compute textarea height without DOM reflow.
 *
 * @param text - Current textarea value
 * @param maxWidth - Textarea width in pixels
 * @param maxHeight - Maximum allowed height before scrolling
 * @param paddingV - Vertical padding (py-2.5 = 10px * 2)
 */
export function usePretextComposerHeight(
  text: string,
  maxWidth: number,
  maxHeight: number = 160,
  paddingV: number = 20 // py-2.5 = 10px * 2
): number {
  return useMemo(() => {
    if (maxWidth <= 0) return COMPOSER_LINE_HEIGHT + paddingV;
    if (!text) return COMPOSER_LINE_HEIGHT + paddingV;

    const prepared = prepare(text, COMPOSER_FONT, { whiteSpace: "pre-wrap" });
    const { height } = layout(prepared, maxWidth, COMPOSER_LINE_HEIGHT);
    return Math.min(height + paddingV, maxHeight);
  }, [text, maxWidth, maxHeight, paddingV]);
}

/**
 * Hook: track an element's width via ResizeObserver for responsive measurement.
 * Returns the content width in pixels, updating on resize.
 */
export function useElementWidth(
  ref: React.RefObject<HTMLElement | null>
): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
        setWidth(Math.floor(w));
      }
    });

    observer.observe(el);
    // Set initial width
    setWidth(Math.floor(el.clientWidth));

    return () => observer.disconnect();
  }, [ref]);

  return width;
}
