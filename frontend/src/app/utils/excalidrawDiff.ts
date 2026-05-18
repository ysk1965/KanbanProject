// Excalidraw scene diff utility for note version comparison.
// Matches elements by id and classifies each into added/removed/modified/unchanged,
// then returns a merged element list with visual overrides applied for read-only display.

export type DiffStatus = "added" | "removed" | "modified" | "unchanged";

export interface DiffStats {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}

export interface SceneDiffResult {
  elements: any[];
  appState: Record<string, any>;
  files: Record<string, any>;
  stats: DiffStats;
}

const COLOR_ADDED = "#10b981";
const COLOR_REMOVED = "#ef4444";
const COLOR_MODIFIED = "#6366f1";

function parseScene(raw: string | null | undefined): {
  elements: any[];
  appState: Record<string, any>;
  files: Record<string, any>;
} {
  if (!raw?.trim()) return { elements: [], appState: {}, files: {} };
  try {
    const parsed = JSON.parse(raw);
    return {
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
      appState: parsed.appState || {},
      files: parsed.files || {},
    };
  } catch {
    return { elements: [], appState: {}, files: {} };
  }
}

// Heuristic comparison of two elements with the same id. Compares the
// properties that meaningfully change in editing: geometry, text, style.
function isModified(prev: any, curr: any): boolean {
  if (prev.version !== curr.version) return true;
  const keys = [
    "x",
    "y",
    "width",
    "height",
    "angle",
    "text",
    "originalText",
    "fontSize",
    "fontFamily",
    "strokeColor",
    "backgroundColor",
    "strokeWidth",
    "strokeStyle",
    "fillStyle",
    "roughness",
    "opacity",
  ];
  for (const k of keys) {
    if (prev[k] !== curr[k]) return true;
  }
  return false;
}

// Visual override applied to an element for diff display. Mutates a shallow copy.
function applyDiffStyle(el: any, status: DiffStatus): any {
  if (status === "unchanged") {
    return { ...el, opacity: Math.min(el.opacity ?? 100, 60) };
  }
  if (status === "added") {
    return {
      ...el,
      strokeColor: COLOR_ADDED,
      strokeWidth: Math.max(el.strokeWidth ?? 2, 2),
    };
  }
  if (status === "removed") {
    return {
      ...el,
      strokeColor: COLOR_REMOVED,
      strokeStyle: "dashed",
      opacity: 35,
    };
  }
  // modified
  return {
    ...el,
    strokeColor: COLOR_MODIFIED,
    strokeWidth: Math.max(el.strokeWidth ?? 2, 2),
  };
}

export function computeSceneDiff(
  previousContent: string | null | undefined,
  currentContent: string | null | undefined,
): SceneDiffResult {
  const prev = parseScene(previousContent);
  const curr = parseScene(currentContent);

  const prevMap = new Map<string, any>();
  for (const el of prev.elements) {
    if (el?.id) prevMap.set(el.id, el);
  }
  const currMap = new Map<string, any>();
  for (const el of curr.elements) {
    if (el?.id) currMap.set(el.id, el);
  }

  const stats: DiffStats = { added: 0, removed: 0, modified: 0, unchanged: 0 };
  const merged: any[] = [];

  // Removed elements rendered first (z-order: behind), then unchanged/modified, then added on top.
  for (const [id, el] of prevMap) {
    if (!currMap.has(id)) {
      stats.removed++;
      merged.push(applyDiffStyle(el, "removed"));
    }
  }
  for (const [id, el] of currMap) {
    const prevEl = prevMap.get(id);
    if (!prevEl) {
      stats.added++;
      merged.push(applyDiffStyle(el, "added"));
    } else if (isModified(prevEl, el)) {
      stats.modified++;
      merged.push(applyDiffStyle(el, "modified"));
    } else {
      stats.unchanged++;
      merged.push(applyDiffStyle(el, "unchanged"));
    }
  }

  return {
    elements: merged,
    appState: curr.appState,
    files: { ...prev.files, ...curr.files },
    stats,
  };
}

export const DIFF_COLORS = {
  added: COLOR_ADDED,
  removed: COLOR_REMOVED,
  modified: COLOR_MODIFIED,
};
