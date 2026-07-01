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
      // CSS + clean copy/paste round-trip). It walks each block's toExternalHTML,
      // so one custom block with a throwing toExternalHTML aborts the whole doc.
      try {
        const html = await editor.blocksToHTMLLossy(editor.document);
        return unwrapListItemParagraphs(html);
      } catch (err) {
        console.error(
          "contentToHtml: blocksToHTMLLossy failed, falling back to full HTML:",
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
