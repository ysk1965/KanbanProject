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
function unwrapListItemParagraphs(html: string): string {
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
}

interface MarkdownExportEditor extends MinimalEditor {
  blocksToMarkdownLossy: (blocks?: any) => Promise<string>;
}

/**
 * Normalize stored content (JSON or HTML) to HTML using a temporary editor.
 * Used by the version diff/preview views, which feed HTML into htmldiff/DOMPurify.
 * The editor instance is provided by the caller (so the throw-away cost is paid
 * once per diff session, not per call).
 */
export async function contentToHtml(
  editor: HtmlExportEditor,
  content: string | null | undefined,
): Promise<string> {
  if (!content?.trim()) return "";
  if (isBlockNoteJson(content)) {
    try {
      const blocks = JSON.parse(content);
      if (Array.isArray(blocks)) {
        editor.replaceBlocks(editor.document, blocks);
        return await editor.blocksToHTMLLossy(editor.document);
      }
    } catch (err) {
      console.error("contentToHtml: JSON parse failed:", err);
    }
  }
  return content;
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
