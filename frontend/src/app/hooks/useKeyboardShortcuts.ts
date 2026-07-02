import { useEffect, useRef } from "react";
import { VIEW_MODE_KEY_MAP } from "../constants/keyboardShortcuts";

const BOARD_SUB_MODES = [
  "kanban",
  "gantt",
  "calendar",
  "list",
  "mindmap",
  "minikanban",
  "milestone",
];
const SCHEDULE_SUB_TAB_MAP: Record<string, string> = {
  "1": "timeblock",
  "2": "calendar",
  "3": "resource",
};
const STATISTICS_SUB_TAB_MAP: Record<string, string> = {
  "1": "overview",
  "2": "individual",
  "3": "team",
  "4": "work",
  "5": "impact",
  "6": "management",
};

interface UseKeyboardShortcutsOptions {
  // Current view
  viewMode: string;
  // View switching
  onViewModeChange: (mode: string) => void;
  // Schedule sub-tab switching
  onScheduleSubTabChange?: (tab: string) => void;
  // Statistics sub-tab switching
  onStatisticsSubTabChange?: (tab: string) => void;
  // Search
  onFocusSearch: () => void;
  // Modals
  onOpenAddFeature: () => void;
  onOpenAddBlock: () => void;
  onOpenShortcutsHelp: () => void;
  // Filters
  onResetFilters: () => void;
  onToggleMyFilter: () => void;
  // Feature navigation
  filteredFeatures: { id: string }[];
  selectedFeatureIds: string[] | null;
  onSelectFeatureIds: (ids: string[] | null) => void;
  // Expand/collapse
  onToggleExpandCollapse: () => void;
  // Permissions
  canEdit: boolean;
  isAdminOrOwner: boolean;
  // Guard
  isAnyModalOpen: boolean;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const opts = optionsRef.current;

      // Cmd+K / Ctrl+K — always works, even in inputs and modals
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyK") {
        e.preventDefault();
        opts.onFocusSearch();
        return;
      }

      // Input guard: skip shortcuts when typing
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      // Excalidraw guard: skip all shortcuts when inside Excalidraw canvas
      if (
        e.target instanceof HTMLElement &&
        e.target.closest(".excalidraw-bridge-container")
      ) {
        return;
      }

      // Modifier guard: skip when Ctrl/Cmd/Alt is held (plain keys only)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Modal guard: skip everything when a modal is open
      if (opts.isAnyModalOpen) {
        return;
      }

      const key = e.key;
      const code = e.code;

      // Q — Toggle my tasks filter
      if (code === "KeyQ") {
        e.preventDefault();
        opts.onToggleMyFilter();
        return;
      }

      // W — Toggle expand/collapse
      if (code === "KeyW") {
        e.preventDefault();
        opts.onToggleExpandCollapse();
        return;
      }

      // / — Focus search
      if (key === "/") {
        e.preventDefault();
        opts.onFocusSearch();
        return;
      }

      // ? — Show shortcuts help
      if (key === "?") {
        e.preventDefault();
        opts.onOpenShortcutsHelp();
        return;
      }

      // Number keys — context-aware sub-view switching
      if (key >= "1" && key <= "6") {
        e.preventDefault();

        // Schedule view: 1-3 switch schedule sub-tabs
        if (opts.viewMode === "schedule") {
          const scheduleTab = SCHEDULE_SUB_TAB_MAP[key];
          if (scheduleTab && opts.onScheduleSubTabChange) {
            opts.onScheduleSubTabChange(scheduleTab);
          }
          return;
        }

        // Statistics view: 1-6 switch statistics sub-tabs
        if (opts.viewMode === "statistics") {
          const statsTab = STATISTICS_SUB_TAB_MAP[key];
          if (statsTab && opts.onStatisticsSubTabChange) {
            opts.onStatisticsSubTabChange(statsTab);
          }
          return;
        }

        // Board view: 1=칸반, 2=마일스톤 서브탭 전환
        if (key <= "2" && BOARD_SUB_MODES.includes(opts.viewMode)) {
          const boardMode = VIEW_MODE_KEY_MAP[key];
          if (boardMode) {
            opts.onViewModeChange(boardMode);
          }
          return;
        }

        return;
      }

      // F — Add Feature (board views only)
      if (
        code === "KeyF" &&
        opts.canEdit &&
        BOARD_SUB_MODES.includes(opts.viewMode)
      ) {
        e.preventDefault();
        opts.onOpenAddFeature();
        return;
      }

      // B — Add Block (board views only)
      if (
        code === "KeyB" &&
        opts.canEdit &&
        opts.isAdminOrOwner &&
        BOARD_SUB_MODES.includes(opts.viewMode)
      ) {
        e.preventDefault();
        opts.onOpenAddBlock();
        return;
      }

      // X — Reset filters
      if (code === "KeyX") {
        e.preventDefault();
        opts.onResetFilters();
        return;
      }

      // ] — Next feature
      if (key === "]") {
        e.preventDefault();
        const features = opts.filteredFeatures;
        if (features.length === 0) return;
        const selected = opts.selectedFeatureIds;
        if (selected === null || selected.length === 0) {
          opts.onSelectFeatureIds([features[0].id]);
        } else {
          const lastId = selected[selected.length - 1];
          const idx = features.findIndex((f) => f.id === lastId);
          const nextIdx = (idx + 1) % features.length;
          opts.onSelectFeatureIds([features[nextIdx].id]);
        }
        return;
      }

      // [ — Previous feature
      if (key === "[") {
        e.preventDefault();
        const features = opts.filteredFeatures;
        if (features.length === 0) return;
        const selected = opts.selectedFeatureIds;
        if (selected === null || selected.length === 0) {
          opts.onSelectFeatureIds([features[features.length - 1].id]);
        } else {
          const firstId = selected[0];
          const idx = features.findIndex((f) => f.id === firstId);
          const prevIdx = (idx - 1 + features.length) % features.length;
          opts.onSelectFeatureIds([features[prevIdx].id]);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
