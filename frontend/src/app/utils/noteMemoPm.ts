/**
 * Inline memo support for EDIT mode (BlockNote / ProseMirror).
 *
 * Read mode anchors memos by wrapping DOM text nodes (see noteAnchor.ts). That
 * cannot be reused here: writing <mark> into the editor DOM would be undone on
 * the next render, and writing a mark into the *document* would pollute both the
 * saved content and the shared Yjs state.
 *
 * So edit mode draws highlights as ProseMirror decorations instead. Decorations
 * live outside the document, and ProseMirror maps them through every
 * transaction — local typing and remote Yjs updates alike — so a memo stays on
 * its passage while people edit around it, at no cost to the stored content.
 *
 * The anchor format is shared with read mode: a block id plus character offsets
 * into that block's own text. Offsets are recomputed from the live decoration
 * positions when the note is published (see readMemoPositions).
 */

import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { NoteCommentAnchor } from "./api";
import type { AnchorDraft } from "./noteAnchor";
import { ANCHOR_CONTEXT_CHARS, ANCHOR_TEXT_MAX } from "./noteAnchor";

export const MEMO_DECORATION_CLASS = "note-inline-memo";
export const noteMemoPluginKey = new PluginKey<MemoPluginState>(
  "noteInlineMemo",
);

export interface MemoSpec {
  id: string;
  blockId: string | null;
  anchor: NoteCommentAnchor;
  resolved: boolean;
  /** highlight this one as the active thread */
  active?: boolean;
}

interface MemoPluginState {
  decos: DecorationSet;
  /** the passage a composer is currently open on (not yet saved) */
  pending: DecorationSet;
}

interface MemoMeta {
  memos?: MemoSpec[];
  pending?: { from: number; to: number } | null;
}

/* ──────────────────────────── document walking ─────────────────────────── */

interface BlockText {
  /** block id from the node that carries it (blockContainer / column / columnList) */
  id: string;
  /** the block's own text, excluding text inside nested child blocks */
  text: string;
  /** text runs, so an own-text offset can be turned into a doc position */
  runs: { pos: number; start: number; end: number }[];
}

const BLOCK_ID_TYPES = new Set(["blockContainer", "column", "columnList"]);

function isBlockNode(node: PMNode): boolean {
  return (
    BLOCK_ID_TYPES.has(node.type.name) && typeof node.attrs?.id === "string"
  );
}

/**
 * Collect a block's own text. Walks the block's children but stops at any
 * nested block, mirroring ownTextSlices() in noteAnchor.ts so read-mode and
 * edit-mode offsets describe the same string.
 */
function blockTextOf(block: PMNode, blockPos: number): BlockText {
  const runs: BlockText["runs"] = [];
  let text = "";
  const walk = (node: PMNode, pos: number) => {
    node.forEach((child, offset) => {
      const childPos = pos + offset + 1;
      if (isBlockNode(child)) return; // nested block — not this block's own text
      if (child.isText && child.text) {
        runs.push({
          pos: childPos,
          start: text.length,
          end: text.length + child.text.length,
        });
        text += child.text;
        return;
      }
      if (child.isLeaf) {
        // atom (mention, image…): contributes its text but has no inner positions
        const leaf = child.textContent;
        if (leaf) text += leaf;
        return;
      }
      walk(child, childPos);
    });
  };
  walk(block, blockPos);
  return { id: block.attrs.id as string, text, runs };
}

function findBlock(doc: PMNode, blockId: string): BlockText | null {
  let found: BlockText | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (isBlockNode(node) && node.attrs.id === blockId) {
      found = blockTextOf(node, pos);
      return false;
    }
    return true;
  });
  return found;
}

function allBlocks(doc: PMNode): BlockText[] {
  const out: BlockText[] = [];
  doc.descendants((node, pos) => {
    if (isBlockNode(node)) out.push(blockTextOf(node, pos));
    return true;
  });
  return out;
}

/** Doc position for an own-text offset. Atoms have no inner positions, so an
 *  offset that lands inside one clamps to the nearest run boundary. */
function posForOffset(block: BlockText, offset: number): number | null {
  for (const run of block.runs) {
    if (offset >= run.start && offset <= run.end)
      return run.pos + (offset - run.start);
  }
  return null;
}

/** Inverse of posForOffset: own-text offset for a doc position. */
function offsetForPos(block: BlockText, pos: number): number | null {
  for (const run of block.runs) {
    const runEndPos = run.pos + (run.end - run.start);
    if (pos >= run.pos && pos <= runEndPos) return run.start + (pos - run.pos);
  }
  return null;
}

/* ───────────────────────────── re-anchoring ────────────────────────────── */

function commonSuffixLen(a: string, b: string): number {
  let n = 0;
  while (
    n < a.length &&
    n < b.length &&
    a[a.length - 1 - n] === b[b.length - 1 - n]
  )
    n++;
  return n;
}
function commonPrefixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function bestOccurrence(
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
    const after = hay.slice(
      idx + text.length,
      idx + text.length + ANCHOR_CONTEXT_CHARS,
    );
    let score =
      commonSuffixLen(before, prefix) + commonPrefixLen(after, suffix);
    if (preferNear != null) score -= Math.abs(idx - preferNear) / 1000;
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
    idx = hay.indexOf(text, idx + 1);
  }
  return best;
}

export interface PmResolvedAnchor {
  from: number;
  to: number;
  blockId: string;
  start: number;
  end: number;
  moved: boolean;
}

/** Same four-step search as read mode, against the ProseMirror document. */
export function resolveAnchorInDoc(
  doc: PMNode,
  blockId: string | null,
  anchor: NoteCommentAnchor,
): PmResolvedAnchor | null {
  const text = anchor.text ?? "";
  if (!text) return null;
  const prefix = anchor.prefix ?? "";
  const suffix = anchor.suffix ?? "";

  const toResolved = (
    block: BlockText,
    start: number,
    moved: boolean,
  ): PmResolvedAnchor | null => {
    const from = posForOffset(block, start);
    const to = posForOffset(block, start + text.length);
    if (from == null || to == null || to <= from) return null;
    return {
      from,
      to,
      blockId: block.id,
      start,
      end: start + text.length,
      moved,
    };
  };

  const block = blockId ? findBlock(doc, blockId) : null;

  // 1. stored offsets, verified against the quote
  if (block && anchor.start != null && anchor.end != null) {
    if (block.text.slice(anchor.start, anchor.end) === text) {
      const hit = toResolved(block, anchor.start, false);
      if (hit) return hit;
    }
  }
  // 2. quote search inside the original block
  if (block) {
    const idx = bestOccurrence(
      block.text,
      text,
      prefix,
      suffix,
      anchor.start ?? undefined,
    );
    if (idx !== -1) {
      const hit = toResolved(block, idx, true);
      if (hit) return hit;
    }
  }
  // 3. quote search across the whole note
  let bestBlock: BlockText | null = null;
  let bestIdx = -1;
  let bestScore = -1;
  for (const b of allBlocks(doc)) {
    if (block && b.id === block.id) continue;
    const idx = bestOccurrence(b.text, text, prefix, suffix);
    if (idx === -1) continue;
    const before = b.text.slice(Math.max(0, idx - ANCHOR_CONTEXT_CHARS), idx);
    const after = b.text.slice(
      idx + text.length,
      idx + text.length + ANCHOR_CONTEXT_CHARS,
    );
    const score =
      commonSuffixLen(before, prefix) + commonPrefixLen(after, suffix);
    if (score > bestScore) {
      bestScore = score;
      bestBlock = b;
      bestIdx = idx;
    }
  }
  if (bestBlock) {
    const hit = toResolved(bestBlock, bestIdx, true);
    if (hit) return hit;
  }
  // 4. orphan
  return null;
}

/* ─────────────────────────── selection → anchor ────────────────────────── */

/**
 * Build an anchor from the editor's current text selection. Clamped to the
 * block the selection starts in, then trimmed of surrounding whitespace, so it
 * matches what read mode would have produced for the same passage.
 */
export function anchorFromEditorSelection(
  state: EditorState,
): AnchorDraft | null {
  const { from, to, empty } = state.selection;
  if (empty || to <= from) return null;

  let block: BlockText | null = null;
  const $from = state.doc.resolve(from);
  for (let d = $from.depth; d >= 0; d--) {
    const node = $from.node(d);
    if (isBlockNode(node)) {
      block = blockTextOf(node, $from.before(d));
      break;
    }
  }
  if (!block || !block.text) return null;

  const startOffset = offsetForPos(block, from);
  if (startOffset == null) return null;
  const endOffsetRaw = offsetForPos(block, to);
  let start = startOffset;
  let end = endOffsetRaw == null ? block.text.length : endOffsetRaw; // selection ran past the block
  if (end <= start) return null;

  while (start < end && /\s/.test(block.text[start])) start++;
  while (end > start && /\s/.test(block.text[end - 1])) end--;
  if (end <= start) return null;
  if (end - start > ANCHOR_TEXT_MAX) end = start + ANCHOR_TEXT_MAX;

  return {
    block_id: block.id,
    text: block.text.slice(start, end),
    prefix: block.text.slice(Math.max(0, start - ANCHOR_CONTEXT_CHARS), start),
    suffix: block.text.slice(end, end + ANCHOR_CONTEXT_CHARS),
    start,
    end,
  };
}

/** Viewport rect of the current selection, for positioning the composer. */
export function selectionRect(view: EditorView): DOMRect | null {
  const { from, to } = view.state.selection;
  try {
    const a = view.coordsAtPos(from);
    const b = view.coordsAtPos(to, -1);
    const left = Math.min(a.left, b.left);
    const right = Math.max(a.right, b.right);
    const top = Math.min(a.top, b.top);
    const bottom = Math.max(a.bottom, b.bottom);
    return new DOMRect(
      left,
      top,
      Math.max(right - left, 1),
      Math.max(bottom - top, 1),
    );
  } catch {
    return null;
  }
}

/* ───────────────────────────────── plugin ──────────────────────────────── */

function buildDecorations(doc: PMNode, memos: MemoSpec[]): DecorationSet {
  const decos: Decoration[] = [];
  for (const memo of memos) {
    const hit = resolveAnchorInDoc(doc, memo.blockId, memo.anchor);
    if (!hit) continue;
    decos.push(
      Decoration.inline(hit.from, hit.to, {
        class: [
          MEMO_DECORATION_CLASS,
          memo.resolved ? "is-resolved" : "",
          memo.active ? "is-active" : "",
        ]
          .filter(Boolean)
          .join(" "),
        "data-comment-id": memo.id,
        "data-resolved": memo.resolved ? "true" : "false",
      }),
    );
  }
  return DecorationSet.create(doc, decos);
}

/**
 * The decoration plugin. Registered through BlockNote's `_extensions` option so
 * it survives editor re-configuration.
 */
export function createNoteMemoPlugin(): Plugin<MemoPluginState> {
  return new Plugin<MemoPluginState>({
    key: noteMemoPluginKey,
    state: {
      init: () => ({
        decos: DecorationSet.empty,
        pending: DecorationSet.empty,
      }),
      apply(tr: Transaction, value: MemoPluginState): MemoPluginState {
        const meta = tr.getMeta(noteMemoPluginKey) as MemoMeta | undefined;
        let { decos, pending } = value;
        if (tr.docChanged) {
          decos = decos.map(tr.mapping, tr.doc);
          pending = pending.map(tr.mapping, tr.doc);
        }
        if (meta?.memos) decos = buildDecorations(tr.doc, meta.memos);
        if (meta && "pending" in meta) {
          pending = meta.pending
            ? DecorationSet.create(tr.doc, [
                Decoration.inline(meta.pending.from, meta.pending.to, {
                  class: `${MEMO_DECORATION_CLASS} is-pending`,
                }),
              ])
            : DecorationSet.empty;
        }
        return { decos, pending };
      },
    },
    props: {
      decorations(state) {
        const pluginState = noteMemoPluginKey.getState(state);
        if (!pluginState) return null;
        return DecorationSet.create(state.doc, [
          ...pluginState.decos.find(),
          ...pluginState.pending.find(),
        ]);
      },
    },
  });
}

/** Redraw all memo highlights from the given specs. */
export function setMemoDecorations(view: EditorView, memos: MemoSpec[]): void {
  view.dispatch(view.state.tr.setMeta(noteMemoPluginKey, { memos }));
}

/** Show (or clear) the provisional highlight while a composer is open. */
export function setPendingMemoRange(
  view: EditorView,
  range: { from: number; to: number } | null,
): void {
  view.dispatch(view.state.tr.setMeta(noteMemoPluginKey, { pending: range }));
}

export interface MemoPosition {
  blockId: string;
  start: number;
  end: number;
}

/**
 * Current (blockId, offset) of every memo highlight, read back from the live
 * decorations. Called when the note is published so edits made around a memo
 * are persisted to its anchor.
 */
export function readMemoPositions(
  state: EditorState,
): Map<string, MemoPosition> {
  const out = new Map<string, MemoPosition>();
  const pluginState = noteMemoPluginKey.getState(state);
  if (!pluginState) return out;
  for (const deco of pluginState.decos.find()) {
    const id = (deco as any).type?.attrs?.["data-comment-id"];
    if (typeof id !== "string") continue;
    const $from = state.doc.resolve(deco.from);
    let block: BlockText | null = null;
    for (let d = $from.depth; d >= 0; d--) {
      const node = $from.node(d);
      if (isBlockNode(node)) {
        block = blockTextOf(node, $from.before(d));
        break;
      }
    }
    if (!block) continue;
    const start = offsetForPos(block, deco.from);
    const end = offsetForPos(block, deco.to);
    if (start == null || end == null || end <= start) continue;
    out.set(id, { blockId: block.id, start, end });
  }
  return out;
}
