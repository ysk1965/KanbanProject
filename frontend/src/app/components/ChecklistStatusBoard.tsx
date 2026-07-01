import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Clock, Wrench, Trash2, Plus, X } from "lucide-react";
import { format } from "date-fns";
import type { ChecklistItem, BoardContractor } from "../types";
import type { BoardMember } from "./ShareBoardModal";
import type { ScheduleBlockDetailResponse } from "../utils/api";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";
import { getTodayDateString } from "../utils/dateUtils";
import {
  resolveChecklistColumn,
  isChecklistOverdue,
  type ChecklistColumn,
} from "../utils/checklistStatus";

interface ChecklistStatusBoardProps {
  items: ChecklistItem[];
  canEdit: boolean;
  boardMembers: BoardMember[];
  contractors?: BoardContractor[];
  timeBlocksMap: Record<string, ScheduleBlockDetailResponse[]>;
  featureColor?: string;
  /** 완료 토글 (체크박스) */
  onToggle: (itemId: string) => void;
  /** 열 이동 (원자적 처리 — 완료 토글 + start_date 패치 조합) */
  onMoveColumn: (item: ChecklistItem, target: ChecklistColumn) => void;
  /** 항목 삭제 (확인 다이얼로그 트리거) */
  onDelete: (itemId: string) => void;
  /** TODO 컬럼 빠른 추가 (제목만 → start_date 없음 → TODO 유지) */
  onQuickAdd: (title: string) => void;
}

const COLUMN_META: {
  key: ChecklistColumn;
  dot: string;
  text: string;
  ring: string;
}[] = [
  {
    key: "todo",
    dot: "bg-slate-400",
    text: "text-slate-400",
    ring: "ring-slate-400/40",
  },
  {
    key: "doing",
    dot: "bg-amber-500",
    text: "text-amber-500",
    ring: "ring-amber-500/40",
  },
  {
    key: "done",
    dot: "bg-emerald-500",
    text: "text-emerald-500",
    ring: "ring-emerald-500/40",
  },
];

// 타임블록 총합(분) → "1h 20m" 형식
function formatMinutes(
  blocks: ScheduleBlockDetailResponse[] | undefined,
): string | null {
  if (!blocks || blocks.length === 0) return null;
  const total = blocks.reduce((sum, b) => {
    const ms =
      new Date(`2000-01-01T${b.end_time}`).getTime() -
      new Date(`2000-01-01T${b.start_time}`).getTime();
    return sum + Math.round(ms / 60000);
  }, 0);
  if (total <= 0) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// 기간 표시 (row 로직 정렬)
function formatRange(item: ChecklistItem): string | null {
  const endDate =
    item.completed && item.done_date ? item.done_date : item.due_date;
  const s = item.start_date;
  if (s && endDate)
    return `${format(new Date(s), "M/d")} - ${format(new Date(endDate), "M/d")}`;
  if (s) return `${format(new Date(s), "M/d")} ~`;
  if (endDate) return `~ ${format(new Date(endDate), "M/d")}`;
  return null;
}

// ────────────────────────────────────────────────────────────
// 카드
// ────────────────────────────────────────────────────────────
function BoardCard({
  item,
  canEdit,
  boardMembers,
  timeBlocksMap,
  today,
  onToggle,
  onDelete,
  dragging = false,
}: {
  item: ChecklistItem;
  canEdit: boolean;
  boardMembers: BoardMember[];
  timeBlocksMap: Record<string, ScheduleBlockDetailResponse[]>;
  today: string;
  onToggle: (itemId: string) => void;
  onDelete?: (itemId: string) => void;
  dragging?: boolean;
}) {
  const memberData = item.assignee
    ? boardMembers.find((m) => m.userId === item.assignee!.id)
    : null;
  const assigneeHex = item.assignee
    ? getAssigneeHex(item.assignee.name, memberData?.assigneeColor)
    : null;

  const range = formatRange(item);
  const est = formatMinutes(timeBlocksMap[item.id]);
  const overdue = isChecklistOverdue(item, today);

  return (
    <div
      className={`group rounded-lg border p-2.5 transition-colors ${
        dragging
          ? "bg-bridge-surface border-bridge-accent/60 shadow-xl"
          : "bg-bridge-surface border-foreground/[0.10] hover:border-foreground/[0.20]"
      }`}
    >
      <div className="flex items-start gap-2">
        {/* 체크박스 */}
        <button
          onClick={canEdit ? () => onToggle(item.id) : undefined}
          disabled={!canEdit}
          aria-label={item.completed ? "완료 해제" : "완료"}
          onPointerDown={(e) => e.stopPropagation()}
          className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all ${
            item.completed
              ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
              : "border-2 border-slate-500 hover:border-slate-300 bg-transparent"
          } ${!canEdit ? "cursor-default" : "cursor-pointer"}`}
        >
          {item.completed && (
            <svg
              className="w-2.5 h-2.5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={3}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          )}
        </button>
        <p
          className={`flex-1 text-[13px] font-medium leading-snug break-words ${
            item.completed ? "line-through text-slate-500" : "text-foreground"
          }`}
        >
          {item.title}
        </p>
        {/* 삭제 버튼 (호버 시 노출) */}
        {canEdit && onDelete && !dragging && (
          <button
            onClick={() => onDelete(item.id)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="삭제"
            className="flex-shrink-0 -mt-0.5 -mr-0.5 p-1 rounded text-slate-500 opacity-0 group-hover:opacity-100 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 메타 */}
      {(range || assigneeHex || item.contractor || est) && (
        <div className="flex items-center gap-2 flex-wrap mt-2 pl-6">
          {range && (
            <span
              className={`text-[11px] ${overdue ? "text-rose-500 font-bold" : "text-slate-500"}`}
            >
              {range}
            </span>
          )}
          {assigneeHex && item.assignee && (
            <span
              className="w-[18px] h-[18px] rounded flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
              style={{ backgroundColor: assigneeHex }}
              title={item.assignee.name}
            >
              {getInitials(item.assignee.name)}
            </span>
          )}
          {!item.assignee && item.contractor && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 h-[18px] rounded text-[10px] font-bold text-white flex-shrink-0"
              style={{ backgroundColor: item.contractor.color || "#6366F1" }}
              title={item.contractor.name}
            >
              <Wrench className="w-2.5 h-2.5" />
              {item.contractor.name}
            </span>
          )}
          {est && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-bridge-secondary">
              <Clock className="w-3 h-3" />
              {est}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function DraggableCard(props: {
  item: ChecklistItem;
  canEdit: boolean;
  boardMembers: BoardMember[];
  timeBlocksMap: Record<string, ScheduleBlockDetailResponse[]>;
  today: string;
  onToggle: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.item.id,
    disabled: !props.canEdit,
  });
  return (
    <div
      ref={setNodeRef}
      {...(props.canEdit ? { ...listeners, ...attributes } : {})}
      className={`${props.canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <BoardCard {...props} />
    </div>
  );
}

function Column({
  meta,
  label,
  items,
  canEdit,
  boardMembers,
  timeBlocksMap,
  today,
  onToggle,
  onDelete,
  onQuickAdd,
}: {
  meta: (typeof COLUMN_META)[number];
  label: string;
  items: ChecklistItem[];
  canEdit: boolean;
  boardMembers: BoardMember[];
  timeBlocksMap: Record<string, ScheduleBlockDetailResponse[]>;
  today: string;
  onToggle: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  /** todo 컬럼에만 전달 */
  onQuickAdd?: (title: string) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: `col-${meta.key}` });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submitAdd = () => {
    const title = draft.trim();
    if (title && onQuickAdd) onQuickAdd(title);
    setDraft("");
    // 연속 추가를 위해 입력창 유지
    inputRef.current?.focus();
  };

  const startAdding = () => {
    setAdding(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border p-2.5 min-h-[180px] transition-colors ${
        isOver
          ? `bg-foreground/[0.05] border-transparent ring-2 ${meta.ring}`
          : "bg-foreground/[0.03] border-foreground/[0.08]"
      }`}
    >
      <div className="flex items-center justify-between mb-2.5 px-1">
        <span
          className={`flex items-center gap-2 text-xs font-bold tracking-wide ${meta.text}`}
        >
          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
          {label}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-bold text-slate-500 bg-foreground/5 px-2 py-0.5 rounded-full">
            {items.length}
          </span>
          {onQuickAdd && canEdit && (
            <button
              onClick={adding ? () => setAdding(false) : startAdding}
              aria-label={t("task.addChecklistItem", {
                defaultValue: "체크리스트 항목 추가",
              })}
              className={`p-0.5 rounded transition-colors ${
                adding
                  ? "text-slate-400 hover:text-foreground"
                  : "text-slate-400 hover:text-bridge-accent hover:bg-bridge-accent/10"
              }`}
            >
              {adding ? (
                <X className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* 빠른 추가 입력 (todo 컬럼) */}
      {onQuickAdd && canEdit && adding && (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") submitAdd();
            else if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          onBlur={() => {
            if (!draft.trim()) setAdding(false);
          }}
          placeholder={t("task.checklistItemPlaceholder", {
            defaultValue: "항목 입력...",
          })}
          className="w-full mb-2 bg-foreground/[0.04] border border-foreground/10 rounded-lg py-1.5 px-2.5 text-[13px] text-foreground placeholder-slate-500 outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
        />
      )}

      <div className="flex-1 space-y-2">
        {items.map((item) => (
          <DraggableCard
            key={item.id}
            item={item}
            canEdit={canEdit}
            boardMembers={boardMembers}
            timeBlocksMap={timeBlocksMap}
            today={today}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

export function ChecklistStatusBoard({
  items,
  canEdit,
  boardMembers,
  timeBlocksMap,
  onToggle,
  onMoveColumn,
  onDelete,
  onQuickAdd,
}: ChecklistStatusBoardProps) {
  const { t } = useTranslation();
  const today = getTodayDateString();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const grouped = useMemo(() => {
    const g: Record<ChecklistColumn, ChecklistItem[]> = {
      todo: [],
      doing: [],
      done: [],
    };
    for (const item of items) g[resolveChecklistColumn(item, today)].push(item);
    // DONE: 최근 완료순(내림차순), 그 외: position 순
    g.done.sort((a, b) => {
      const av = a.completed_at || a.done_date || "";
      const bv = b.completed_at || b.done_date || "";
      return bv.localeCompare(av);
    });
    return g;
  }, [items, today]);

  const activeItem = activeId
    ? items.find((i) => i.id === activeId) || null
    : null;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id;
    if (!overId) return;
    const target = String(overId).replace("col-", "") as ChecklistColumn;
    if (!["todo", "doing", "done"].includes(target)) return;
    const item = items.find((i) => i.id === String(e.active.id));
    if (!item) return;
    if (resolveChecklistColumn(item, today) === target) return;
    onMoveColumn(item, target);
  };

  const labels: Record<ChecklistColumn, string> = {
    todo: t("task.checklistView.todo", { defaultValue: "TODO" }),
    doing: t("task.checklistView.doing", { defaultValue: "DOING" }),
    done: t("task.checklistView.done", { defaultValue: "DONE" }),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-3 gap-2.5">
        {COLUMN_META.map((meta) => (
          <Column
            key={meta.key}
            meta={meta}
            label={labels[meta.key]}
            items={grouped[meta.key]}
            canEdit={canEdit}
            boardMembers={boardMembers}
            timeBlocksMap={timeBlocksMap}
            today={today}
            onToggle={onToggle}
            onDelete={onDelete}
            onQuickAdd={meta.key === "todo" ? onQuickAdd : undefined}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem && (
          <BoardCard
            item={activeItem}
            canEdit={canEdit}
            boardMembers={boardMembers}
            timeBlocksMap={timeBlocksMap}
            today={today}
            onToggle={onToggle}
            dragging
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
