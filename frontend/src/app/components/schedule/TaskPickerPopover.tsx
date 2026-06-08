import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X, ListChecks } from "lucide-react";

export interface TaskPickerItem {
  taskId: string;
  taskTitle: string;
  featureId: string;
  featureTitle: string;
  featureColor: string;
}

interface TaskPickerPopoverProps {
  tasks: TaskPickerItem[];
  /** 앵커 좌표 (그리기 종료 지점) */
  x: number;
  y: number;
  /** 태스크 선택 시 (taskId, 임시 항목 제목) */
  onSelect: (taskId: string, title: string) => void;
  onClose: () => void;
}

interface FeatureGroup {
  featureId: string;
  featureTitle: string;
  featureColor: string;
  tasks: TaskPickerItem[];
}

const PANEL_WIDTH = 320;
const PANEL_MAX_HEIGHT = 420;

/**
 * 워크로드에서 빈 행을 드래그해 임시(예정) 바를 그린 뒤,
 * 어떤 태스크의 일인지 선택하는 플로팅 팝오버.
 * 태스크를 클릭하면 해당 태스크 제목을 임시 항목 제목으로 사용해 즉시 생성한다.
 */
export function TaskPickerPopover({
  tasks,
  x,
  y,
  onSelect,
  onClose,
}: TaskPickerPopoverProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // 뷰포트 밖으로 나가지 않도록 위치 보정
  const pos = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    return {
      left: Math.max(8, Math.min(x, vw - PANEL_WIDTH - 8)),
      top: Math.max(8, Math.min(y, vh - PANEL_MAX_HEIGHT - 8)),
    };
  }, [x, y]);

  const groups = useMemo<FeatureGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? tasks.filter(
          (task) =>
            task.taskTitle.toLowerCase().includes(q) ||
            task.featureTitle.toLowerCase().includes(q),
        )
      : tasks;

    const map = new Map<string, FeatureGroup>();
    for (const task of filtered) {
      let group = map.get(task.featureId);
      if (!group) {
        group = {
          featureId: task.featureId,
          featureTitle: task.featureTitle,
          featureColor: task.featureColor,
          tasks: [],
        };
        map.set(task.featureId, group);
      }
      group.tasks.push(task);
    }
    return [...map.values()];
  }, [tasks, query]);

  return (
    <>
      {/* 외부 클릭 닫기 */}
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />

      <div
        className="fixed z-50 flex flex-col bg-bridge-obsidian border border-foreground/10 rounded-2xl shadow-2xl overflow-hidden"
        style={{
          left: pos.left,
          top: pos.top,
          width: PANEL_WIDTH,
          maxHeight: PANEL_MAX_HEIGHT,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Top accent line */}
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-foreground/[0.08]">
          <ListChecks className="w-4 h-4 text-bridge-accent shrink-0" />
          <span className="text-xs font-bold text-foreground flex-1">
            {t("schedule.taskPicker.title", "임시 업무 배치 · 태스크 선택")}
          </span>
          <button
            type="button"
            aria-label={t("common.close", "닫기")}
            onClick={onClose}
            className="text-slate-400 hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pt-2.5 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("schedule.taskPicker.search", "태스크 검색...")}
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 pl-9 pr-3
                text-xs text-foreground placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
          {groups.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">
              {t("schedule.taskPicker.empty", "태스크가 없습니다")}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.featureId} className="mb-2">
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: group.featureColor }}
                  />
                  <span className="text-xs font-bold text-slate-400 truncate">
                    {group.featureTitle}
                  </span>
                </div>
                {group.tasks.map((task) => (
                  <button
                    key={task.taskId}
                    type="button"
                    onClick={() => onSelect(task.taskId, task.taskTitle)}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-foreground
                      hover:bg-foreground/5 transition-colors truncate"
                  >
                    {task.taskTitle}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

TaskPickerPopover.displayName = "TaskPickerPopover";
