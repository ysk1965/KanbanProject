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
    try {
      const blocks = JSON.parse(content);
      if (Array.isArray(blocks)) {
        editor.replaceBlocks(editor.document, blocks);
        const html = await editor.blocksToHTMLLossy(editor.document);
        return unwrapListItemParagraphs(html);
      }
    } catch (err) {
      console.error("contentToHtml: JSON parse failed:", err);
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
