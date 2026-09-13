// Pasted HTML from dashboards / reports (sprint retrospective pages, BI
// widgets, KPI cards) carries layout that BlockNote has no block for: CSS grid
// "stat cards" (a big number + a label per tile), div/SVG heatmaps, charts.
// BlockNote's tryParseHTMLToBlocks walks such markup and emits one paragraph
// per leaf text node, so "450 / 총 커밋 / 8 / 참여 인원 / …" lands as a column
// of bare lines and SVG <text> labels become dozens of orphan paragraphs with
// blank blocks between them.
//
// This module rewrites those patterns into markup BlockNote *does* keep:
//   • stat-card grids   → a table (labels as header row, values below; or one
//                         row per card when there are many cards / segments)
//   • SVG / canvas      → SVG <text> labels collapsed into ONE compact
//                         paragraph ("6/30 70 · 7/01 65 · …"); canvas dropped
//   • style / script    → removed
// Everything else is left byte-for-byte alone. When nothing matched, the
// ORIGINAL string is returned unchanged so callers can keep their
// "cleaned === html → delegate to default paste" fast path.

const CARD_CONTAINER_TAGS = new Set(["DIV", "SECTION", "UL", "OL", "ARTICLE"]);
const CARD_TAGS = new Set(["DIV", "SECTION", "ARTICLE", "LI", "DD", "A"]);
const DISQUALIFYING_INSIDE_CARD = "table, ul, ol, img, video, iframe, pre";
const MAX_SEGMENTS_PER_CARD = 4;
const MAX_SEGMENT_CHARS = 48;
const MIN_CARDS = 3;
// Above this many cards a one-row-per-card table reads better than a very
// wide header + value table.
const MAX_CARDS_AS_COLUMNS = 6;

const NUMERIC_RE = /^[~≈+\-−]?\s*[\d.,]+\s*(%|[kKmM]|명|건|개|회|일|시간|분|초|점|x|X)?$/;

interface Card {
  segments: string[];
}

// Text with a space between child nodes, so "6/30<span>70</span>" reads
// "6/30 70" rather than "6/3070" (textContent concatenates without spacing).
function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  const parts: string[] = [];
  node.childNodes.forEach((c) => {
    const t = textOf(c);
    if (t) parts.push(t);
  });
  return parts.join(" ");
}

function isNumericLike(text: string): boolean {
  return NUMERIC_RE.test(text);
}

// A leaf element ("6/30<span>70</span>", "<b>450</b> 총 커밋") is split into
// its direct text runs and inline children ONLY when that exposes a numeric
// segment — otherwise it is prose with formatting and stays one segment.
function leafSegments(el: Element): string[] {
  const parts: string[] = [];
  el.childNodes.forEach((c) => {
    if (c.nodeType === Node.TEXT_NODE || c.nodeType === Node.ELEMENT_NODE) {
      const t = textOf(c);
      if (t) parts.push(t);
    }
  });
  if (parts.length > 1 && parts.some(isNumericLike)) return parts;
  const whole = textOf(el);
  return whole ? [whole] : [];
}

// Leaf text segments of a card in document order. An element with no element
// children (or only inline formatting children) counts as one segment.
function collectSegments(el: Element): string[] | null {
  const segments: string[] = [];
  const walk = (node: Element): boolean => {
    const elementChildren = Array.from(node.children).filter(
      (c) => !["BR", "SVG", "PATH"].includes(c.tagName),
    );
    const hasBlockChildren = elementChildren.some(
      (c) => !isInlineTag(c.tagName),
    );
    if (!hasBlockChildren) {
      segments.push(...leafSegments(node));
      return segments.length <= MAX_SEGMENTS_PER_CARD;
    }
    for (const child of elementChildren) {
      if (isInlineTag(child.tagName)) {
        const t = textOf(child);
        if (t) segments.push(t);
      } else if (!walk(child)) {
        return false;
      }
      if (segments.length > MAX_SEGMENTS_PER_CARD) return false;
    }
    return true;
  };
  if (!walk(el)) return null;
  return segments;
}

function isInlineTag(tag: string): boolean {
  return [
    "SPAN",
    "STRONG",
    "B",
    "EM",
    "I",
    "SMALL",
    "SUP",
    "SUB",
    "CODE",
    "LABEL",
    "ABBR",
    "TIME",
    "MARK",
  ].includes(tag);
}

function asCard(el: Element): Card | null {
  if (!CARD_TAGS.has(el.tagName)) return null;
  if (el.querySelector(DISQUALIFYING_INSIDE_CARD)) return null;
  const segments = collectSegments(el);
  if (!segments || segments.length === 0) return null;
  if (segments.some((s) => s.length > MAX_SEGMENT_CHARS)) return null;
  return { segments };
}

// A "card grid" is a container whose element children are ALL small cards.
// Prose containers fail this because paragraphs/headings are not card tags,
// and a card holding a list, table, or image is disqualified.
function detectCardGrid(container: Element): Card[] | null {
  if (!CARD_CONTAINER_TAGS.has(container.tagName)) return null;
  const children = Array.from(container.childNodes).filter((n) => {
    if (n.nodeType === Node.ELEMENT_NODE) return true;
    return n.nodeType === Node.TEXT_NODE && textOf(n) !== "";
  });
  if (children.length < MIN_CARDS) return null;
  const cards: Card[] = [];
  for (const child of children) {
    if (child.nodeType !== Node.ELEMENT_NODE) return null;
    const card = asCard(child as Element);
    if (!card) return null;
    cards.push(card);
  }
  // Single-segment cards are only a "grid" when they are uniformly tiny
  // (heatmap cells, legend swatches). Longer single lines are probably prose
  // in divs (Google Docs / web copy) and must be left alone.
  const allSingle = cards.every((c) => c.segments.length === 1);
  if (allSingle && cards.some((c) => c.segments[0].length > 12)) return null;
  return cards;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTable(doc: Document, cards: Card[]): Element {
  const table = doc.createElement("table");
  const allSingle = cards.every((c) => c.segments.length === 1);
  const allPairs = cards.every((c) => c.segments.length === 2);

  if (allSingle) {
    // Heatmap-like cells: one compact row.
    const tbody = doc.createElement("tbody");
    const tr = doc.createElement("tr");
    for (const c of cards) {
      const td = doc.createElement("td");
      td.textContent = c.segments[0];
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    table.appendChild(tbody);
    return table;
  }

  if (allPairs && cards.length <= MAX_CARDS_AS_COLUMNS) {
    // KPI tiles: labels as header, values as the single data row. The numeric
    // segment is the value regardless of source order.
    const labels: string[] = [];
    const values: string[] = [];
    for (const c of cards) {
      const [a, b] = c.segments;
      const aNum = NUMERIC_RE.test(a);
      const bNum = NUMERIC_RE.test(b);
      if (bNum && !aNum) {
        labels.push(a);
        values.push(b);
      } else {
        labels.push(b);
        values.push(a);
      }
    }
    const thead = doc.createElement("thead");
    const hr = doc.createElement("tr");
    for (const l of labels) {
      const th = doc.createElement("th");
      th.textContent = l;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    const tbody = doc.createElement("tbody");
    const vr = doc.createElement("tr");
    for (const v of values) {
      const td = doc.createElement("td");
      td.textContent = v;
      vr.appendChild(td);
    }
    tbody.appendChild(vr);
    table.appendChild(thead);
    table.appendChild(tbody);
    return table;
  }

  // Generic: one row per card, one column per segment (padded).
  const width = Math.max(...cards.map((c) => c.segments.length));
  const tbody = doc.createElement("tbody");
  for (const c of cards) {
    const tr = doc.createElement("tr");
    for (let i = 0; i < width; i++) {
      const td = doc.createElement("td");
      td.textContent = c.segments[i] ?? "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// Depth-first so the innermost grids convert first; a converted <table> then
// disqualifies its ancestors from being treated as a card grid.
function convertCardGrids(doc: Document): boolean {
  let changed = false;
  const visit = (el: Element) => {
    for (const child of Array.from(el.children)) visit(child);
    const cards = detectCardGrid(el);
    if (!cards) return;
    const table = buildTable(doc, cards);
    el.replaceWith(table);
    changed = true;
  };
  visit(doc.body);
  return changed;
}

function collapseSvgs(doc: Document): boolean {
  let changed = false;
  doc.querySelectorAll("svg").forEach((svg) => {
    const labels = Array.from(svg.querySelectorAll("text"))
      .map((t) => textOf(t))
      .filter(Boolean);
    if (labels.length > 0) {
      // Pair "label value" runs (axis tick + number) so a heatmap/bar chart
      // collapses to "6/30 70 · 7/01 65" instead of alternating fragments.
      const pairs: string[] = [];
      for (let i = 0; i < labels.length; i++) {
        const cur = labels[i];
        const next = labels[i + 1];
        if (next !== undefined && !isNumericLike(cur) && isNumericLike(next)) {
          pairs.push(`${cur} ${next}`);
          i++;
        } else {
          pairs.push(cur);
        }
      }
      const p = doc.createElement("p");
      p.innerHTML = pairs.map(escapeHtml).join(" · ");
      svg.replaceWith(p);
    } else {
      svg.remove();
    }
    changed = true;
  });
  doc.querySelectorAll("canvas, style, script, noscript").forEach((el) => {
    el.remove();
    changed = true;
  });
  return changed;
}

/**
 * Rewrite dashboard/report layout HTML into table + paragraph markup that
 * survives BlockNote's HTML parser. Returns the input string untouched when
 * no pattern matched.
 */
export function normalizeLayoutHtml(html: string): string {
  if (!html || typeof DOMParser === "undefined") return html;
  // Cheap pre-check: nothing to do for plain prose markup.
  if (!/<(div|section|ul|ol|article|svg|canvas|style|script)\b/i.test(html)) {
    return html;
  }
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return html;
  }
  const a = collapseSvgs(doc);
  const b = convertCardGrids(doc);
  if (!a && !b) return html;
  return doc.body.innerHTML;
}
