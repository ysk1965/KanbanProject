import { yUndoPluginKey } from "y-prosemirror";
// BlockNote note content is stored as either:
//   - JSON: `JSON.stringify(editor.document)` — starts with '[' (Block[])
//   - HTML: legacy `blocksToHTMLLossy(editor.document)` — starts with '<'
// Both forms must continue to round-trip indefinitely.

export function isBlockNoteJson(content: string | null | undefined): boolean {
  if (!content) return false;
  const head = content.trimStart();
  return head.startsWith("[");
}

// Mirror of NoteEditor.unwrapListItemParagraphs — handles both blocksToHTMLLossy
// (<li><p>...</p></li>) and legacy blocksToFullHTML
// (<div data-content-type="...ListItem"><p>...</p></div>) so that
// tryParseHTMLToBlocks does not produce empty parent list items + nested children.
export function unwrapListItemParagraphs(html: string): string {
  if (!html) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("li > p").forEach((p) => {
    const li = p.parentElement!;
    while (p.firstChild) {
      li.insertBefore(p.firstChild, p);
    }
    p.remove();
  });
  doc
    .querySelectorAll(
      'div[data-content-type="bulletListItem"] > p,' +
        'div[data-content-type="numberedListItem"] > p,' +
        'div[data-content-type="checkListItem"] > p',
    )
    .forEach((p) => {
      const container = p.parentElement!;
      while (p.firstChild) {
        container.insertBefore(p.firstChild, p);
      }
      p.remove();
    });
  return doc.body.innerHTML;
}

// Whitespace (newlines, indentation) between block-level closing/opening tags
// becomes empty paragraph blocks once BlockNote's tryParseHTMLToBlocks reads
// it. BlockNote's own copy serializer formats with newlines between blocks too,
// so this affects internal note→note paste (blocknote/html, raw=true) just as
// much as external paste (text/html). Inline whitespace inside text is left
// alone — we only target whitespace BETWEEN block tags.
export function collapseInterBlockWhitespace(html: string): string {
  return html.replace(
    /(<\/(?:p|div|h[1-6]|ul|ol|li|blockquote|pre|table|tr|thead|tbody)>)\s+(?=<(?:p|div|h[1-6]|ul|ol|li|blockquote|pre|table|tr|thead|tbody)\b)/gi,
    "$1",
  );
}

// Word, Google Docs, Notion, and most browser-rendered HTML emit padding
// "empty" paragraphs — `<p></p>`, `<p><br></p>`, `<p>&nbsp;</p>` — that look
// like nothing but become blank blocks once BlockNote's tryParseHTMLToBlocks
// converts them. Strip them before paste so external paste doesn't leave a
// trail of empty blocks. Whitespace-only text nodes also count as empty.
export function stripEmptyParagraphs(html: string): string {
  if (!html) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.body.querySelectorAll("p").forEach((p) => {
    if (p.textContent?.trim()) return;
    const onlyBr = p.children.length === 1 && p.children[0].tagName === "BR";
    if (p.childNodes.length === 0 || onlyBr) {
      p.remove();
    }
  });
  return doc.body.innerHTML;
}

// ── Pasted-image handling ───────────────────────────────────────────────────
// External rich-text paste (Word / web / Notion / Google Docs) brings in <img>
// tags whose src may be a relative reference ("image.png") with no loadable
// bytes, a data: URI, or a blob: URL. Left untouched these become permanently
// broken image blocks — and a bare relative src is turned by resolveFileUrl into
// an unresolvable host (https://api.bridgespots.comimage.png → ERR_NAME_NOT_RESOLVED).
// We rewrite them so only loadable images survive: recoverable bytes (data:/blob:)
// are uploaded to our storage, absolute http(s) URLs are kept, everything else is
// dropped.

/** True if `html` contains any <img> we must rewrite (data:/blob:/relative/empty src). */
export function needsImageRewrite(html: string): boolean {
  if (!html || html.indexOf("<img") === -1) return false;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("img")).some((img) => {
    const src = img.getAttribute("src") || "";
    if (!src) return true; // empty src → drop
    if (src.startsWith("data:") || src.startsWith("blob:")) return true;
    return !src.startsWith("http://") && !src.startsWith("https://");
  });
}

/** Decode a `data:[mime][;base64],…` URI into a File. Returns null on any failure. */
function dataUriToFile(dataUri: string, fallbackName: string): File | null {
  try {
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUri);
    if (!match) return null;
    const mime = match[1] || "image/png";
    const isBase64 = !!match[2];
    const data = match[3];
    let bytes: Uint8Array;
    if (isBase64) {
      const bin = atob(data);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(data));
    }
    const ext = (mime.split("/")[1] || "png").split("+")[0];
    return new File([bytes], `${fallbackName}.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

/**
 * Rewrite <img> tags in pasted HTML so the note keeps only loadable images.
 *  - data: URI         → upload bytes via uploadFn, replace src with returned URL
 *  - blob: URL         → fetch bytes, upload, replace (drop on failure)
 *  - http(s) absolute  → keep as-is
 *  - else (relative / bare / file: / empty) → remove the <img>
 * Uploads run in parallel; a failed upload drops that one image rather than
 * aborting the whole paste.
 */
export async function resolvePastedImages(
  html: string,
  uploadFn: (file: File) => Promise<string>,
): Promise<string> {
  if (!html) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const imgs = Array.from(doc.querySelectorAll("img"));

  await Promise.all(
    imgs.map(async (img, i) => {
      const src = img.getAttribute("src") || "";
      try {
        if (src.startsWith("http://") || src.startsWith("https://")) {
          return; // already loadable
        }
        let file: File | null = null;
        if (src.startsWith("data:")) {
          file = dataUriToFile(src, `pasted-${i}`);
        } else if (src.startsWith("blob:")) {
          const blob = await fetch(src).then((r) => r.blob());
          const ext = (blob.type.split("/")[1] || "png").split("+")[0];
          file = new File([blob], `pasted-${i}.${ext}`, {
            type: blob.type || "image/png",
          });
        }
        if (file) {
          const url = await uploadFn(file);
          img.setAttribute("src", url);
          return;
        }
      } catch {
        /* fall through to removal */
      }
      img.remove(); // unrecoverable (relative / bare / file: / failed upload)
    }),
  );

  return doc.body.innerHTML;
}

// Plain-text paste goes through BlockNote's default handler, which turns every
// line into a paragraph block — list markers ("- ", "* ", "• ", "1. ") are kept
// as literal text. Detect those markers and build list HTML so pasted plain
// text becomes real list item blocks. Returns null when no marker is found, so
// the caller falls through to the default handler.
const BULLET_LINE = /^[-*•]\s+(.+)$/;
const NUMBERED_LINE = /^\d+[.)]\s+(.+)$/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function plainTextListToHtml(text: string): string | null {
  if (!text?.trim()) return null;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const hasListLine = lines.some((line) => {
    const trimmed = line.trim();
    return BULLET_LINE.test(trimmed) || NUMBERED_LINE.test(trimmed);
  });
  if (!hasListLine) return null;

  const out: string[] = [];
  let openList: "ul" | "ol" | null = null;
  const closeList = () => {
    if (openList) {
      out.push(`</${openList}>`);
      openList = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    const bullet = line.match(BULLET_LINE);
    const numbered = bullet ? null : line.match(NUMBERED_LINE);
    const tag = bullet ? "ul" : numbered ? "ol" : null;
    if (tag) {
      if (openList !== tag) {
        closeList();
        out.push(`<${tag}>`);
        openList = tag;
      }
      out.push(`<li>${escapeHtml((bullet ?? numbered)![1])}</li>`);
    } else {
      closeList();
      out.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

// Editor interface kept loose to dodge BlockNote's heavy generic parameters at
// call sites. The methods we use are stable across 0.28.x.
interface MinimalEditor {
  document: any;
  replaceBlocks: (existing: any, blocks: any) => void;
  tryParseHTMLToBlocks: (html: string) => Promise<any>;
}

/**
 * Hydrate an editor from stored content. Detects JSON vs HTML automatically.
 * Returns true on success.
 */
export async function loadIntoEditor(
  editor: MinimalEditor,
  content: string | null | undefined,
): Promise<boolean> {
  if (!editor) return false;
  if (!content?.trim()) {
    editor.replaceBlocks(editor.document, []);
    return true;
  }
  if (isBlockNoteJson(content)) {
    try {
      const blocks = JSON.parse(content);
      if (Array.isArray(blocks)) {
        editor.replaceBlocks(editor.document, blocks);
        return true;
      }
    } catch (err) {
      // Fall through to HTML path — content may be malformed JSON.
      console.error("Failed to parse BlockNote JSON, trying HTML path:", err);
    }
  }
  try {
    const blocks = await editor.tryParseHTMLToBlocks(
      unwrapListItemParagraphs(content),
    );
    editor.replaceBlocks(editor.document, blocks);
    return true;
  } catch (err) {
    console.error("Failed to load note content into editor:", err);
    return false;
  }
}

/**
 * Drop the Yjs undo history after hydrating an editor from a stored snapshot.
 *
 * Hydration goes through editor.replaceBlocks(), i.e. a regular ProseMirror
 * transaction that y-prosemirror's sync plugin writes into the Y.Doc with the
 * tracked ySyncPluginKey origin. The UndoManager therefore records the whole
 * snapshot injection as the first undo item, and one Cmd+Z past the user's own
 * edits pops it — blanking the document. Clearing the stacks removes that
 * item; stopCapturing() prevents the user's first keystroke from being merged
 * into the same capture window (default 500ms) as the hydration.
 */
export function clearUndoHistoryAfterHydration(editor: any): void {
  try {
    const state = editor?._tiptapEditor?.state;
    if (!state) return;
    const undoManager = yUndoPluginKey.getState(state)?.undoManager;
    if (!undoManager) return;
    undoManager.clear();
    undoManager.stopCapturing();
  } catch (err) {
    console.warn("Failed to clear undo history after hydration:", err);
  }
}

/** Serialize editor state for persistence. Always JSON. */
export function serializeForSave(editor: MinimalEditor): string {
  return JSON.stringify(editor.document);
}

interface HtmlExportEditor extends MinimalEditor {
  blocksToHTMLLossy: (blocks?: any) => Promise<string>;
  // Full HTML uses each block's internal render (toInternalHTML) — the same path
  // BlockNoteView uses in edit mode — instead of toExternalHTML. Kept as a
  // fallback for content whose lossy export throws (see contentToHtml).
  blocksToFullHTML: (blocks?: any) => Promise<string>;
}

/**
 * Wrapper class for a run of non-list child blocks nested under a parent block
 * in the static view HTML. Styled in blocknote-dark.css (.note-view-render /
 * .shared-note-viewer) and notePrint.ts with the same 1.5rem indent that nested
 * <ul>/<ol> get, so it mirrors the editor's .bn-block-group indentation.
 */
export const NESTED_CHILDREN_CLASS = "note-nested-children";

const LIST_TAGS = new Set(["UL", "OL"]);

function isListEl(node: Node | null | undefined): node is HTMLElement {
  return !!node && node.nodeType === 1 && LIST_TAGS.has(node.nodeName);
}

/**
 * Merge consecutive <ul>/<ul> or <ol>/<ol> siblings into one list. Block-by-block
 * export emits a separate list per item, and BlockNote's own serializer would
 * have merged them; merging also keeps <ol> numbering continuous.
 */
function mergeAdjacentLists(parent: ParentNode): void {
  let node = parent.firstChild;
  while (node) {
    const next = node.nextSibling;
    if (
      isListEl(node) &&
      isListEl(next) &&
      node.nodeName === next.nodeName
    ) {
      while (next.firstChild) node.appendChild(next.firstChild);
      next.remove();
      continue; // re-check `node` against its new next sibling
    }
    node = next;
  }
}

/**
 * Append serialized child blocks into the parent's own markup so the static
 * view keeps the editor's nesting. BlockNote's external HTML serializer only
 * nests leading <ul>/<ol> children into a list item and flattens everything
 * else (images, files, paragraphs, and any list after them) up to the parent's
 * level — see serializeBlocksExternalHTML.ts in @blocknote/core.
 *
 * Placement by parent type:
 *   - list items:    lists go straight into the <li>; runs of non-list nodes
 *                    are wrapped in a NESTED_CHILDREN_CLASS div so they don't
 *                    match the `li > p` unwrap/inline rules
 *   - toggle:        inside <details>, after <summary>
 *   - columnLayout:  columns straight inside the flex container
 *   - column:        inside the column's outer div, after its inline content
 *   - anything else: a NESTED_CHILDREN_CLASS div appended after the block
 */
function attachChildren(
  doc: Document,
  blockType: string,
  blockNodes: Node[],
  childFrag: DocumentFragment,
): Node[] {
  const lastEl = [...blockNodes].reverse().find((n) => n.nodeType === 1) as
    | HTMLElement
    | undefined;

  const wrapRun = (host: ParentNode) => {
    let run: HTMLElement | null = null;
    while (childFrag.firstChild) {
      const child = childFrag.firstChild;
      if (isListEl(child)) {
        run = null;
        host.appendChild(child);
      } else {
        if (!run) {
          run = doc.createElement("div");
          run.className = NESTED_CHILDREN_CLASS;
          host.appendChild(run);
        }
        run.appendChild(child);
      }
    }
    mergeAdjacentLists(host);
  };

  if (lastEl && isListEl(lastEl)) {
    const li = lastEl.lastElementChild;
    if (li && li.nodeName === "LI") {
      wrapRun(li);
      return blockNodes;
    }
  }

  if (lastEl && blockType === "toggle" && lastEl.nodeName === "DETAILS") {
    wrapRun(lastEl);
    return blockNodes;
  }

  if (
    lastEl &&
    (blockType === "columnLayout" || blockType === "column") &&
    lastEl.getAttribute("data-block-type") === blockType
  ) {
    while (childFrag.firstChild) lastEl.appendChild(childFrag.firstChild);
    mergeAdjacentLists(lastEl);
    return blockNodes;
  }

  const wrapper = doc.createElement("div");
  wrapper.className = NESTED_CHILDREN_CLASS;
  wrapper.appendChild(childFrag);
  mergeAdjacentLists(wrapper);
  return [...blockNodes, wrapper];
}

/**
 * Stamp the block's id onto the element that represents it in the static view
 * (`data-id`, the same attribute BlockNote uses in the editor DOM). Inline
 * memos anchor to `[data-id]` + a character offset inside that block's own
 * text, so the view HTML must expose block identity. For list items the <li>
 * is stamped rather than the <ul>/<ol>: mergeAdjacentLists later folds sibling
 * lists together and would drop an attribute on the list element.
 */
function stampBlockId(nodes: Node[], blockId: unknown): void {
  if (typeof blockId !== "string" || !blockId) return;
  const first = nodes.find((n): n is HTMLElement => n.nodeType === 1);
  if (!first) return;
  let target: HTMLElement = first;
  if (LIST_TAGS.has(first.nodeName)) {
    const li = first.querySelector(":scope > li");
    if (li) target = li as HTMLElement;
  }
  if (!target.hasAttribute("data-id")) target.setAttribute("data-id", blockId);
}

/**
 * Serialize a block tree to external (lossy) HTML while preserving nesting.
 * Each block is exported on its own (children stripped) via blocksToHTMLLossy
 * and its children are recursively attached by attachChildren. A block whose
 * lossy export throws falls back to blocksToFullHTML for that block only, so a
 * single broken custom block no longer blanks the whole document.
 *
 * The caller must have already loaded the full document into `editor` —
 * blocksToHTMLLossy(blocks) doesn't touch editor.document, but custom blocks
 * such as tableOfContents read it during export.
 */
async function serializeBlocksNested(
  editor: HtmlExportEditor,
  blocks: any[],
  doc: Document,
): Promise<DocumentFragment> {
  const frag = doc.createDocumentFragment();
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const { children, ...rest } = block;
    const solo = [{ ...rest, children: [] }];
    let html = "";
    try {
      html = await editor.blocksToHTMLLossy(solo);
    } catch (err) {
      console.error(
        `contentToHtml: blocksToHTMLLossy failed for block "${block.type}", falling back to full HTML:`,
        err,
      );
      try {
        html = await editor.blocksToFullHTML(solo);
      } catch (err2) {
        console.error("contentToHtml: blocksToFullHTML failed:", err2);
      }
    }
    const tpl = doc.createElement("template");
    tpl.innerHTML = html;
    let nodes: Node[] = Array.from(tpl.content.childNodes);
    stampBlockId(nodes, block.id);

    if (Array.isArray(children) && children.length > 0) {
      const childFrag = await serializeBlocksNested(editor, children, doc);
      nodes = attachChildren(doc, String(block.type ?? ""), nodes, childFrag);
    }
    frag.append(...nodes);
  }
  mergeAdjacentLists(frag);
  return frag;
}

interface MarkdownExportEditor extends MinimalEditor {
  blocksToMarkdownLossy: (blocks?: any) => Promise<string>;
}

/**
 * Normalize stored content (JSON or HTML) to HTML using a temporary editor.
 * Used by the version diff/preview views, which feed HTML into htmldiff/DOMPurify.
 * The editor instance is provided by the caller (so the throw-away cost is paid
 * once per diff session, not per call).
 *
 * Output is run through unwrapListItemParagraphs so that text copied from the
 * static view and pasted back into an editor round-trips cleanly — without this,
 * blocksToHTMLLossy's <li><p>…</p></li> structure makes BlockNote's paste parser
 * emit empty parent list items with the text nested as a child block.
 */
export async function contentToHtml(
  editor: HtmlExportEditor,
  content: string | null | undefined,
): Promise<string> {
  if (!content?.trim()) return "";
  if (isBlockNoteJson(content)) {
    let blocks: unknown = null;
    try {
      blocks = JSON.parse(content);
    } catch (err) {
      console.error("contentToHtml: JSON.parse failed:", err);
    }
    if (Array.isArray(blocks)) {
      // replaceBlocks can throw if a block fails schema validation (usually a
      // config mismatch between this throwaway editor and the live one). The
      // editor instance is reused across notes, so on failure we must clear it
      // to empty — otherwise the export below would emit the PREVIOUS note's
      // stale blocks and render them under the current note.
      try {
        editor.replaceBlocks(editor.document, blocks);
      } catch (err) {
        console.error("contentToHtml: replaceBlocks failed:", err);
        try {
          editor.replaceBlocks(editor.document, []);
        } catch {
          /* editor already empty or unusable */
        }
        return "";
      }
      // Primary: lossy export (simple HTML tuned for the static .note-view-render
      // CSS + clean copy/paste round-trip), done block-by-block so nested
      // children (images/files under a list item, toggle bodies, columns) stay
      // nested instead of being flattened by BlockNote's external serializer.
      try {
        const frag = await serializeBlocksNested(
          editor,
          editor.document,
          document,
        );
        const holder = document.createElement("div");
        holder.appendChild(frag);
        return unwrapListItemParagraphs(holder.innerHTML);
      } catch (err) {
        console.error(
          "contentToHtml: nested lossy export failed, falling back to full HTML:",
          err,
        );
      }
      // Fallback: full HTML uses the same internal render as edit mode's
      // BlockNoteView, so it survives blocks whose toExternalHTML throws.
      try {
        return await editor.blocksToFullHTML(editor.document);
      } catch (err) {
        console.error("contentToHtml: blocksToFullHTML failed:", err);
      }
      // Never render the raw JSON string as text — better an empty view.
      return "";
    }
  }
  return unwrapListItemParagraphs(content);
}

/**
 * Normalize stored content to Markdown. JSON path uses blocksToMarkdownLossy
 * directly; HTML path round-trips through tryParseHTMLToBlocks first. Used by
 * the "Copy as Markdown" action.
 */
export async function contentToMarkdown(
  editor: MarkdownExportEditor,
  content: string | null | undefined,
): Promise<string> {
  if (!content?.trim()) return "";
  if (isBlockNoteJson(content)) {
    try {
      const blocks = JSON.parse(content);
      if (Array.isArray(blocks)) {
        editor.replaceBlocks(editor.document, blocks);
        return await editor.blocksToMarkdownLossy(editor.document);
      }
    } catch (err) {
      console.error("contentToMarkdown: JSON parse failed:", err);
    }
  }
  try {
    const blocks = await editor.tryParseHTMLToBlocks(content);
    editor.replaceBlocks(editor.document, blocks);
    return await editor.blocksToMarkdownLossy(editor.document);
  } catch (err) {
    console.error("contentToMarkdown: HTML parse failed:", err);
    return "";
  }
}
