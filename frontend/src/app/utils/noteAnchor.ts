/**
 * Inline memo anchoring for the static note view (.note-view-render).
 *
 * An anchor is a text range inside one block: the block's `data-id` plus a
 * character offset into that block's OWN text (nested child blocks excluded),
 * along with the quoted text and 32 chars of context on each side. This is the
 * W3C Web Annotation TextQuoteSelector + TextPositionSelector pair: offsets are
 * the fast path, the quote + context re-find the range after the body changes.
 *
 * Resolution order (see resolveAnchor):
 *   1. offsets in the original block, verified against the quote
 *   2. quote search inside the original block, scored by prefix/suffix
 *   3. quote search across the whole note
 *   4. give up → ORPHANED (caller shows the quote without a highlight)
 */

import type { NoteCommentAnchor } from "./api";

export const MEMO_MARK_CLASS = "note-inline-memo";
export const ANCHOR_CONTEXT_CHARS = 32;
export const ANCHOR_TEXT_MAX = 500;

export interface AnchorDraft extends NoteCommentAnchor {
  block_id: string;
  text: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
}

export interface ResolvedAnchor {
  range: Range;
  blockId: string;
  start: number;
  end: number;
  /** true when the stored offsets/block were stale and were re-found */
  moved: boolean;
}

interface TextSlice {
  node: Text;
  start: number; // cumulative offset of node start within block own-text
  end: number;
}

/** Nearest block element (`[data-id]`) that owns this node. */
export function blockOf(node: Node | null): HTMLElement | null {
  if (!node) return null;
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return (el?.closest("[data-id]") as HTMLElement | null) ?? null;
}

/**
 * Text nodes that belong to this block itself — descendants that sit inside a
 * nested `[data-id]` block are skipped, so offsets stay stable when children
 * are added or removed under a list item / toggle.
 */
export function ownTextSlices(block: HTMLElement): TextSlice[] {
  const slices: TextSlice[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      blockOf(n) === block ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  let offset = 0;
  let cur: Node | null;
  while ((cur = walker.nextNode())) {
    const text = cur as Text;
    const len = text.data.length;
    slices.push({ node: text, start: offset, end: offset + len });
    offset += len;
  }
  return slices;
}

export function ownText(block: HTMLElement): string {
  return ownTextSlices(block)
    .map((s) => s.node.data)
    .join("");
}

function offsetOfBoundary(
  slices: TextSlice[],
  container: Node,
  offset: number,
): number | null {
  if (container.nodeType === 3) {
    const s = slices.find((x) => x.node === container);
    return s ? s.start + offset : null;
  }
  // Element boundary: offset counts child nodes. Map to the first text slice
  // at/after that child, or the end of the block when past the last child.
  const child = container.childNodes[offset] ?? null;
  if (!child) {
    const lastInside = slices.filter((x) => container.contains(x.node));
    return lastInside.length ? lastInside[lastInside.length - 1].end : null;
  }
  const first = slices.find(
    (x) =>
      child === x.node ||
      (child.nodeType === 1 && (child as Element).contains(x.node)) ||
      // child precedes this slice in document order
      !!(child.compareDocumentPosition(x.node) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
  return first ? first.start : null;
}

/**
 * Build an anchor from a live selection. The range is clamped to the block the
 * selection starts in (a memo belongs to exactly one block). Returns null when
 * the selection is empty, whitespace-only, or not inside a block.
 */
export function anchorFromRange(range: Range): AnchorDraft | null {
  const block = blockOf(range.startContainer);
  if (!block || !block.dataset.id) return null;
  const slices = ownTextSlices(block);
  if (!slices.length) return null;
  const full = slices.map((s) => s.node.data).join("");

  let start = offsetOfBoundary(slices, range.startContainer, range.startOffset);
  if (start == null) return null;
  let end: number;
  if (block.contains(range.endContainer) && blockOf(range.endContainer) === block) {
    const e = offsetOfBoundary(slices, range.endContainer, range.endOffset);
    end = e ?? full.length;
  } else {
    end = full.length; // selection ran past this block → clamp
  }
  if (end <= start) return null;

  // trim surrounding whitespace so the highlight hugs the words
  while (start < end && /\s/.test(full[start])) start++;
  while (end > start && /\s/.test(full[end - 1])) end--;
  if (end <= start) return null;
  if (end - start > ANCHOR_TEXT_MAX) end = start + ANCHOR_TEXT_MAX;

  return {
    block_id: block.dataset.id,
    text: full.slice(start, end),
    prefix: full.slice(Math.max(0, start - ANCHOR_CONTEXT_CHARS), start),
    suffix: full.slice(end, end + ANCHOR_CONTEXT_CHARS),
    start,
    end,
  };
}

/** Range covering [start, end) of the block's own text. */
export function rangeFromOffsets(
  block: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const slices = ownTextSlices(block);
  const startSlice = slices.find((s) => start >= s.start && start < s.end);
  const endSlice = slices.find((s) => end > s.start && end <= s.end);
  if (!startSlice || !endSlice) return null;
  const range = document.createRange();
  range.setStart(startSlice.node, start - startSlice.start);
  range.setEnd(endSlice.node, end - endSlice.start);
  return range;
}

function commonSuffixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
function commonPrefixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** Best occurrence of `text` in `hay`, scored by how much context agrees. */
function findBestOccurrence(
  hay: string,
  text: string,
  prefix: string,
  suffix: string,
  preferNear?: number,
): number {
  let best = -1;
  let bestScore = -1;
  let idx = hay.indexOf(text);
  while (idx !== -1) {
    const before = hay.slice(Math.max(0, idx - ANCHOR_CONTEXT_CHARS), idx);
    const after = hay.slice(idx + text.length, idx + text.length + ANCHOR_CONTEXT_CHARS);
    let score = commonSuffixLen(before, prefix) + commonPrefixLen(after, suffix);
    if (preferNear != null) score -= Math.abs(idx - preferNear) / 1000; // tie-break
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
    idx = hay.indexOf(text, idx + 1);
  }
  return best;
}

/**
 * Locate an anchor in the rendered note. `container` is the .note-view-render
 * root (or any ancestor of the blocks).
 */
export function resolveAnchor(
  container: HTMLElement,
  blockId: string | null,
  anchor: NoteCommentAnchor,
): ResolvedAnchor | null {
  const text = anchor.text ?? "";
  if (!text) return null;
  const prefix = anchor.prefix ?? "";
  const suffix = anchor.suffix ?? "";

  const block = blockId
    ? (container.querySelector(`[data-id="${CSS.escape(blockId)}"]`) as HTMLElement | null)
    : null;

  // 1. offsets, verified
  if (block && anchor.start != null && anchor.end != null) {
    const full = ownText(block);
    if (full.slice(anchor.start, anchor.end) === text) {
      const range = rangeFromOffsets(block, anchor.start, anchor.end);
      if (range) return { range, blockId: block.dataset.id!, start: anchor.start, end: anchor.end, moved: false };
    }
  }

  // 2. quote search inside the original block
  if (block) {
    const full = ownText(block);
    const idx = findBestOccurrence(full, text, prefix, suffix, anchor.start ?? undefined);
    if (idx !== -1) {
      const range = rangeFromOffsets(block, idx, idx + text.length);
      if (range) return { range, blockId: block.dataset.id!, start: idx, end: idx + text.length, moved: true };
    }
  }

  // 3. every block in the note
  const blocks = Array.from(container.querySelectorAll<HTMLElement>("[data-id]"));
  let bestBlock: HTMLElement | null = null;
  let bestIdx = -1;
  let bestScore = -1;
  for (const b of blocks) {
    if (b === block) continue;
    const full = ownText(b);
    const idx = findBestOccurrence(full, text, prefix, suffix);
    if (idx === -1) continue;
    const before = full.slice(Math.max(0, idx - ANCHOR_CONTEXT_CHARS), idx);
    const after = full.slice(idx + text.length, idx + text.length + ANCHOR_CONTEXT_CHARS);
    const score = commonSuffixLen(before, prefix) + commonPrefixLen(after, suffix);
    if (score > bestScore) {
      bestScore = score;
      bestBlock = b;
      bestIdx = idx;
    }
  }
  if (bestBlock && bestBlock.dataset.id) {
    const range = rangeFromOffsets(bestBlock, bestIdx, bestIdx + text.length);
    if (range) return { range, blockId: bestBlock.dataset.id, start: bestIdx, end: bestIdx + text.length, moved: true };
  }

  return null;
}

/**
 * Wrap every text node touched by `range` in a <mark>. Splits boundary text
 * nodes so the surrounding markup is untouched. Returns the marks created.
 */
export function wrapRangeWithMarks(
  range: Range,
  attrs: Record<string, string>,
  className = MEMO_MARK_CLASS,
): HTMLElement[] {
  const root = range.commonAncestorContainer;
  const rootEl = root.nodeType === 1 ? (root as Element) : root.parentElement!;
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const targets: Text[] = [];
  let cur: Node | null;
  while ((cur = walker.nextNode())) targets.push(cur as Text);

  const marks: HTMLElement[] = [];
  for (let t of targets) {
    // slice the boundary nodes down to the selected portion
    if (t === range.endContainer && range.endOffset < t.data.length) {
      t.splitText(range.endOffset);
    }
    if (t === range.startContainer && range.startOffset > 0) {
      t = t.splitText(range.startOffset);
    }
    if (!t.data.length) continue;
    const mark = document.createElement("mark");
    mark.className = className;
    for (const [k, v] of Object.entries(attrs)) mark.setAttribute(k, v);
    t.parentNode!.insertBefore(mark, t);
    mark.appendChild(t);
    marks.push(mark);
  }
  return marks;
}

/** Remove every memo <mark> under `container`, re-joining split text nodes. */
export function unwrapMarks(container: HTMLElement, className = MEMO_MARK_CLASS): void {
  const marks = Array.from(container.querySelectorAll<HTMLElement>(`mark.${className}`));
  const parents = new Set<Node>();
  for (const m of marks) {
    const parent = m.parentNode;
    if (!parent) continue;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parents.add(parent);
  }
  parents.forEach((p) => p.normalize());
}
