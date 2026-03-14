import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Keyboard } from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import {
  GLOBAL_SHORTCUTS,
  BOARD_SHORTCUTS,
  SCHEDULE_SHORTCUTS,
  STATISTICS_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  type ShortcutDefinition,
} from "../constants/keyboardShortcuts";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

const CATEGORY_LABELS: Record<string, string> = {
  navigation: "categoryNavigation",
  creation: "categoryCreation",
  filter: "categoryFilter",
};

function KeyBadge({ label }: { label: string }) {
  const display = !isMac && label === "⌘" ? "Ctrl" : label;
  return (
    <kbd className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-foreground/[0.06] text-foreground border border-foreground/[0.08] min-w-[28px] text-center inline-flex items-center justify-center">
      {display}
    </kbd>
  );
}

function ShortcutRow({
  shortcut,
  index,
}: {
  shortcut: ShortcutDefinition;
  index: number;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      key={shortcut.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-foreground/[0.03] transition-colors"
    >
      <span className="text-xs text-foreground">{t(shortcut.i18nKey)}</span>
      <div className="flex items-center gap-1 shrink-0 ml-4">
        {shortcut.id === "focusSearch" ? (
          <>
            <KeyBadge label="/" />
            <span className="text-xs text-slate-500 mx-1">
              {t("common.or", "or")}
            </span>
            <KeyBadge label="⌘" />
            <span className="text-xs text-slate-500 mx-0.5">+</span>
            <KeyBadge label="K" />
          </>
        ) : (
          shortcut.keys.map((k, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && (
                <span className="text-xs text-slate-500 mx-0.5">+</span>
              )}
              <KeyBadge label={k} />
            </span>
          ))
        )}
      </div>
    </motion.div>
  );
}

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps) {
  const { t } = useTranslation();

  // Combine all shortcuts: global + board + schedule + statistics
  const allShortcuts = [
    ...GLOBAL_SHORTCUTS.filter((s) => s.id !== "focusSearchCmd"),
    ...BOARD_SHORTCUTS,
    ...SCHEDULE_SHORTCUTS,
    ...STATISTICS_SHORTCUTS,
  ];

  const grouped = SHORTCUT_CATEGORIES.map((category) => ({
    category,
    items: allShortcuts.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      className="sm:max-w-lg"
      accentColor
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 flex items-center justify-center">
          <Keyboard size={16} className="text-bridge-accent" />
        </div>
        <h2 className="text-sm font-bold text-foreground">
          {t("keyboardShortcuts.title")}
        </h2>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {grouped.map((group) => {
          // Split navigation items into sub-groups for context display
          const globalItems = group.items.filter((s) => !s.viewContext);
          const boardItems = group.items.filter(
            (s) => s.viewContext === "board",
          );
          const scheduleItems = group.items.filter(
            (s) => s.viewContext === "schedule",
          );
          const statisticsItems = group.items.filter(
            (s) => s.viewContext === "statistics",
          );

          return (
            <div key={group.category}>
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t(`keyboardShortcuts.${CATEGORY_LABELS[group.category]}`)}
                </span>
              </div>
              <div className="space-y-1">
                {globalItems.map((s, i) => (
                  <ShortcutRow key={s.id} shortcut={s} index={i} />
                ))}

                {boardItems.length > 0 && (
                  <>
                    <div className="text-xs text-slate-500 px-2 pt-2 pb-0.5">
                      {t("keyboardShortcuts.contextBoard", "보드 탭")}
                    </div>
                    {boardItems.map((s, i) => (
                      <ShortcutRow key={s.id} shortcut={s} index={i} />
                    ))}
                  </>
                )}

                {scheduleItems.length > 0 && (
                  <>
                    <div className="text-xs text-slate-500 px-2 pt-2 pb-0.5">
                      {t("keyboardShortcuts.contextSchedule", "일정 탭")}
                    </div>
                    {scheduleItems.map((s, i) => (
                      <ShortcutRow key={s.id} shortcut={s} index={i} />
                    ))}
                  </>
                )}

                {statisticsItems.length > 0 && (
                  <>
                    <div className="text-xs text-slate-500 px-2 pt-2 pb-0.5">
                      {t("keyboardShortcuts.contextStatistics", "AI분석 탭")}
                    </div>
                    {statisticsItems.map((s, i) => (
                      <ShortcutRow key={s.id} shortcut={s} index={i} />
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">
          Esc {t("common.close", "닫기")}
        </span>
      </div>
    </MotionModal>
  );
}
