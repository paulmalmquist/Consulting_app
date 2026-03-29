# Pretext Integration Plan for Winston Chat Workspace

**Date:** 2026-03-29
**Source:** @_chenglou/pretext (v0.0.3) — already in `pretext-main/`
**Target surfaces:** `repo-b/src/components/winston/` chat workspace

---

## Why This Matters

Winston's chat workspace renders every message in the DOM simultaneously, uses CSS-based sizing for bubbles, and triggers DOM reflow for composer auto-resize. This works for short conversations but creates a hard ceiling on performance as conversation length grows and as we add richer response blocks.

Pretext provides pure-TypeScript text measurement that bypasses DOM layout entirely. The two-phase design (`prepare()` for one-time measurement, `layout()` for pure arithmetic) means we can compute pixel-accurate heights and widths for any text block at negligible cost (~0.09ms for 500 texts), enabling virtualization, shrinkwrap, and reflow-free sizing without architectural rewrites.

---

## Phase 1: Foundation Layer

### 1.1 Install and integrate `@chenglou/pretext`

Add as a dependency in `repo-b/package.json`:
```json
"@chenglou/pretext": "file:../pretext-main"
```
Or publish/link from the local `pretext-main/` folder.

### 1.2 Create `usePretextMeasure` hook

Location: `repo-b/src/hooks/usePretextMeasure.ts`

```typescript
import { prepare, layout, type PreparedText } from '@chenglou/pretext'

// Cache prepared texts by message ID + font
const cache = new Map<string, PreparedText>()

export function measureMessageHeight(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
  messageId: string
): number {
  const key = `${messageId}:${font}`
  let prepared = cache.get(key)
  if (!prepared) {
    prepared = prepare(text, font)
    cache.set(key, prepared)
  }
  return layout(prepared, maxWidth, lineHeight).height
}
```

Key design decisions:
- Cache `PreparedText` per message ID (messages are immutable after streaming completes)
- `layout()` is cheap enough to call on every resize without caching
- Font string must match the rendered font exactly (use named fonts, not `system-ui`)

### 1.3 Create `usePretextShrinkwrap` hook

Location: `repo-b/src/hooks/usePretextShrinkwrap.ts`

Uses `prepareWithSegments` + `walkLineRanges` to binary-search for the tightest bubble width that doesn't increase line count beyond what the max width produces. This is the core of the bubbles demo.

---

## Phase 2: Chat Message Virtualization

### Target file: `ChatConversationArea.tsx`

**Current state:** All messages rendered in a single `<div className="space-y-4">`, scrolled with `scrollIntoView`.

**Target state:** Virtualized list where only visible messages (plus a small overscan buffer) are in the DOM. Heights pre-computed by pretext.

### 2.1 Height computation pipeline

When a message arrives (or finishes streaming):
1. Extract plain text from message content (strip markdown for measurement, or measure the rendered text)
2. Call `prepare(text, font)` once → cache the `PreparedText`
3. On render/resize, call `layout(prepared, containerWidth, lineHeight)` → get pixel height
4. Add padding, block chrome (avatar, timestamp, action buttons) to get total row height
5. Feed heights into virtualizer

For response blocks (charts, tables, KPIs): use fixed known heights (charts are 280px, KPIs are grid-sized). Only text blocks need pretext measurement.

### 2.2 Virtualizer implementation

Two options:
- **Option A:** Use `@tanstack/react-virtual` with pretext-computed heights as `estimateSize` / `getItemSize`. This is the fastest path — TanStack Virtual handles the scroll math, pretext provides accurate heights.
- **Option B:** Build a custom virtualizer using pretext's linear height traversal (like the masonry demo). More control, fewer dependencies, but more work.

**Recommendation:** Option A for v1. The integration is straightforward:

```typescript
const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: (index) => getMessageHeight(messages[index]),
  overscan: 5,
})
```

Where `getMessageHeight` uses the pretext cache.

### 2.3 Scroll behavior

Replace current `scrollIntoView` pattern with virtualizer's `scrollToIndex`:
- On new message: `virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })`
- Preserve "scrolled up" detection: compare `virtualizer.scrollOffset` against total size

---

## Phase 3: Shrinkwrap Chat Bubbles

### Target file: `ChatConversationArea.tsx` → `MessageBubble`

**Current state:** All messages constrained by `max-w-4xl` CSS class.

**Target state:** Each message bubble sized to the tightest width that accommodates its text content.

### 3.1 Shrinkwrap algorithm

From pretext's bubbles demo:
1. `prepareWithSegments(text, font)`
2. Compute line count at max width
3. Binary search between `minWidth` (widest single word) and `maxWidth` for the narrowest width that produces the same line count
4. Use `walkLineRanges` for the binary search (it's the fastest API for speculative width testing)

### 3.2 Apply to message rendering

```tsx
const optimalWidth = usePretextShrinkwrap(message.content, font, maxBubbleWidth)

<div style={{ maxWidth: optimalWidth }}>
  {/* message content */}
</div>
```

Short messages ("Got it", "Yes") get tight bubbles. Long paragraphs fill to max width. This matches iMessage/Slack behavior.

### 3.3 Streaming messages

During streaming, the message content is changing every 50ms (token buffer). Two approaches:
- **Approach A:** Only shrinkwrap after streaming completes. During streaming, use max width. Snap to optimal width on completion (with a subtle CSS transition).
- **Approach B:** Shrinkwrap on every token flush. Pretext's `layout()` is fast enough (~0.18μs per call), but `prepare()` would need to re-run on content change (~0.04ms per message). At 20 updates/sec this is fine.

**Recommendation:** Approach A for cleaner UX — bubble width jumping during streaming would be distracting.

---

## Phase 4: Reflow-Free Composer

### Target file: `ChatPromptComposer.tsx`

**Current state:** `autoResize` callback reads `el.scrollHeight` on every input event, triggering synchronous layout.

**Target state:** Compute textarea height from text content using pretext, apply via style, zero reflow.

### 4.1 Implementation

```typescript
const handleInput = useCallback((e) => {
  const text = e.target.value
  setText(text)

  // Pretext measurement instead of DOM read
  const prepared = prepare(text, composerFont, { whiteSpace: 'pre-wrap' })
  const { height } = layout(prepared, composerWidth, composerLineHeight)
  const clampedHeight = Math.min(height + padding, MAX_COMPOSER_HEIGHT)
  composerRef.current.style.height = `${clampedHeight}px`
}, [composerFont, composerWidth])
```

Note the `whiteSpace: 'pre-wrap'` option — this matches textarea behavior where explicit newlines are preserved.

---

## Phase 5: Secondary Wins

### 5.1 Accordion heights for collapsible blocks

Tool activity blocks and thinking indicators can use pretext to pre-compute their expanded height, enabling CSS `max-height` transitions without layout shift:

```typescript
const expandedHeight = measureMessageHeight(toolOutput, font, width, lineHeight, blockId)
// Use in CSS transition: max-height: expandedHeight
```

### 5.2 Context panel virtualization

The `ChatContextPanel.tsx` currently limits visible items with `.slice()`. With pretext heights, we could virtualize the full citation/tool lists if they grow large.

### 5.3 Table row height pre-computation

`ChatTableBlock.tsx` renders all rows. For large result sets, pretext can measure cell text to compute row heights for virtualized table rendering.

---

## Architecture Notes

### What pretext replaces
- `el.scrollHeight` reads in composer auto-resize
- Implicit DOM-based height computation for scroll management
- Fixed `max-width` CSS for bubble sizing

### What pretext does NOT replace
- Recharts for chart rendering
- Markdown rendering pipeline
- Response block type dispatch
- AI gateway / streaming infrastructure
- React component structure (pretext is a measurement layer, not a rendering layer)

### Font requirements
- Must use named fonts (e.g., `'16px Inter'`, `'14px "IBM Plex Sans"'`), not `system-ui`
- Font string must match what's actually rendered in CSS
- If Winston uses variable font weights, measure with the specific weight

### Browser support
- Uses `Intl.Segmenter` (Chrome 87+, Safari 15.4+, Firefox 126+)
- Uses `OffscreenCanvas` where available, falls back to DOM canvas
- Engine profiles auto-detect Safari vs Chromium quirks

---

## Implementation Order

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P0 | Foundation layer (hooks, caching) | 1 day | Enables everything else |
| P0 | Message virtualization | 2-3 days | Unlocks unlimited conversation length |
| P1 | Shrinkwrap bubbles | 1 day | Significant visual polish |
| P1 | Composer reflow-free resize | 0.5 day | Smoother typing feel |
| P2 | Accordion/collapsible heights | 0.5 day | No layout shift on expand |
| P2 | Context panel virtualization | 0.5 day | Handles large tool/citation lists |
| P3 | Table virtualization | 1 day | Large result set performance |

Total estimated effort: ~6-7 days for full integration.

---

## Reference

- Pretext source: `pretext-main/src/layout.ts` (public API)
- Bubbles demo: `pretext-main/pages/demos/bubbles.ts`
- Masonry demo: `pretext-main/pages/demos/masonry/`
- Winston chat: `repo-b/src/components/winston/ChatConversationArea.tsx`
- Winston composer: `repo-b/src/components/winston/ChatPromptComposer.tsx`
- Winston blocks: `repo-b/src/components/winston/blocks/`
