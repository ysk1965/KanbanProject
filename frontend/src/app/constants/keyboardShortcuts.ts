export interface ShortcutDefinition {
  id: string;
  keys: string[];
  i18nKey: string;
  category: "navigation" | "creation" | "filter";
  /** If set, only shown in the help modal for this view context */
  viewContext?: "board" | "schedule" | "statistics";
}

// Board sub-view shortcuts (shown when on board tab)
export const BOARD_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: "viewKanban",
    keys: ["1"],
    i18nKey: "keyboardShortcuts.viewKanban",
    category: "navigation",
    viewContext: "board",
  },
  {
    id: "viewList",
    keys: ["2"],
    i18nKey: "keyboardShortcuts.viewList",
    category: "navigation",
    viewContext: "board",
  },
  {
    id: "viewGantt",
    keys: ["3"],
    i18nKey: "keyboardShortcuts.viewGantt",
    category: "navigation",
    viewContext: "board",
  },
  {
    id: "viewCalendar",
    keys: ["4"],
    i18nKey: "keyboardShortcuts.viewCalendar",
    category: "navigation",
    viewContext: "board",
  },
  {
    id: "viewMilestone",
    keys: ["5"],
    i18nKey: "keyboardShortcuts.viewMilestone",
    category: "navigation",
    viewContext: "board",
  },
];

// Schedule sub-tab shortcuts (shown when on schedule tab)
export const SCHEDULE_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: "schedTimeblock",
    keys: ["1"],
    i18nKey: "keyboardShortcuts.schedTimeblock",
    category: "navigation",
    viewContext: "schedule",
  },
  {
    id: "schedCalendar",
    keys: ["2"],
    i18nKey: "keyboardShortcuts.schedCalendar",
    category: "navigation",
    viewContext: "schedule",
  },
  {
    id: "schedResource",
    keys: ["3"],
    i18nKey: "keyboardShortcuts.schedResource",
    category: "navigation",
    viewContext: "schedule",
  },
];

// Statistics sub-tab shortcuts (shown when on statistics tab)
export const STATISTICS_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: "statsOverview",
    keys: ["1"],
    i18nKey: "keyboardShortcuts.statsOverview",
    category: "navigation",
    viewContext: "statistics",
  },
  {
    id: "statsIndividual",
    keys: ["2"],
    i18nKey: "keyboardShortcuts.statsIndividual",
    category: "navigation",
    viewContext: "statistics",
  },
  {
    id: "statsTeam",
    keys: ["3"],
    i18nKey: "keyboardShortcuts.statsTeam",
    category: "navigation",
    viewContext: "statistics",
  },
  {
    id: "statsWork",
    keys: ["4"],
    i18nKey: "keyboardShortcuts.statsWork",
    category: "navigation",
    viewContext: "statistics",
  },
  {
    id: "statsImpact",
    keys: ["5"],
    i18nKey: "keyboardShortcuts.statsImpact",
    category: "navigation",
    viewContext: "statistics",
  },
  {
    id: "statsManagement",
    keys: ["6"],
    i18nKey: "keyboardShortcuts.statsManagement",
    category: "navigation",
    viewContext: "statistics",
  },
];

// Global shortcuts (always active)
export const GLOBAL_SHORTCUTS: ShortcutDefinition[] = [
  // Filter
  {
    id: "filterMyTasks",
    keys: ["Q"],
    i18nKey: "keyboardShortcuts.filterMyTasks",
    category: "filter",
  },
  {
    id: "resetFilters",
    keys: ["X"],
    i18nKey: "keyboardShortcuts.resetFilters",
    category: "filter",
  },
  {
    id: "prevFeature",
    keys: ["["],
    i18nKey: "keyboardShortcuts.prevFeature",
    category: "filter",
  },
  {
    id: "nextFeature",
    keys: ["]"],
    i18nKey: "keyboardShortcuts.nextFeature",
    category: "filter",
  },

  // Navigation
  {
    id: "toggleExpand",
    keys: ["W"],
    i18nKey: "keyboardShortcuts.toggleExpand",
    category: "navigation",
  },
  {
    id: "focusSearch",
    keys: ["/"],
    i18nKey: "keyboardShortcuts.focusSearch",
    category: "navigation",
  },
  {
    id: "focusSearchCmd",
    keys: ["⌘", "K"],
    i18nKey: "keyboardShortcuts.focusSearch",
    category: "navigation",
  },
  {
    id: "showHelp",
    keys: ["?"],
    i18nKey: "keyboardShortcuts.showHelp",
    category: "navigation",
  },

  // Creation (board only, but always listed)
  {
    id: "addFeature",
    keys: ["F"],
    i18nKey: "keyboardShortcuts.addFeature",
    category: "creation",
  },
  {
    id: "addBlock",
    keys: ["B"],
    i18nKey: "keyboardShortcuts.addBlock",
    category: "creation",
  },
];

export const SHORTCUT_CATEGORIES = [
  "navigation",
  "creation",
  "filter",
] as const;

// BoardViewSwitcher SUB_VIEWS 순서와 일치
export const VIEW_MODE_KEY_MAP: Record<string, string> = {
  "1": "kanban",
  "2": "list",
  "3": "gantt",
  "4": "calendar",
  "5": "milestone",
};
