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
import {
  Clock,
  Wrench,
  Trash2,
  Plus,
  X,
  Calendar as CalendarIcon,
  ArrowRightLeft,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { ChecklistItem, BoardContractor, ContractorInfo } from "../types";
import type { BoardMember } from "./ShareBoardModal";
import type { ScheduleBlockDetailResponse } from "../utils/api";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { Button } from "./ui/button";
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
  isPersonal?: boolean;
  /** 완료 토글 (체크박스) */
  onToggle: (itemId: string) => void;
  /** 열 이동 (원자적 처리 — 완료 토글 + start_date 패치 조합) */
  onMoveColumn: (item: ChecklistItem, target: ChecklistColumn) => void;
  /** 항목 필드 수정 (제목/날짜/담당자 — 리스트뷰 handleUpdateChecklistItem과 동일 계약) */
  onUpdateItem: (itemId: string, updates: Partial<ChecklistItem>) => void;
  /** 항목 삭제 (확인 다이얼로그 트리거) */
  onDelete: (itemId: string) => void;
  /** 다른 태스크로 이동 (모달 트리거) */
  onMoveToTask?: (itemId: string) => void;
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
  contractors = [],
  timeBlocksMap,
  today,
  isPersonal = false,
  onToggle,
  onUpdate,
  onDelete,
  onMoveToTask,
  dragging = false,
}: {
  item: ChecklistItem;
  canEdit: boolean;
  boardMembers: BoardMember[];
  contractors?: BoardContractor[];
  timeBlocksMap: Record<string, ScheduleBlockDetailResponse[]>;
  today: string;
  isPersonal?: boolean;
  onToggle: (itemId: string) => void;
  onUpdate?: (itemId: string, updates: Partial<ChecklistItem>) => void;
  onDelete?: (itemId: string) => void;
  onMoveToTask?: (itemId: string) => void;
  dragging?: boolean;
}) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(item.title);
  const [showTimeBlocks, setShowTimeBlocks] = useState(false);

  const memberData = item.assignee
    ? boardMembers.find((m) => m.userId === item.assignee!.id)
    : null;
  const assigneeHex = item.assignee
    ? getAssigneeHex(item.assignee.name, memberData?.assigneeColor)
    : null;
  const contractorColor = item.contractor?.color || "#6366F1";

  const timeBlocks = timeBlocksMap[item.id] || [];
  const range = formatRange(item);
  const est = formatMinutes(timeBlocks);
  const overdue = isChecklistOverdue(item, today);
  const interactive = canEdit && !dragging && !!onUpdate;

  const startEditing = () => {
    if (!interactive) return;
    setEditedTitle(item.title);
    setIsEditing(true);
  };

  const commitTitle = () => {
    const title = editedTitle.trim();
    if (title && title !== item.title) onUpdate?.(item.id, { title });
    setIsEditing(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") commitTitle();
    else if (e.key === "Escape") {
      setEditedTitle(item.title);
      setIsEditing(false);
    }
  };

  // 미배정 상태의 편집 트리거는 호버 시에만 노출 (카드 클러터 방지)
  const ghostTrigger = "opacity-0 group-hover:opacity-100 transition-opacity";

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

        {/* 제목 — 클릭 시 인라인 편집 (리스트뷰 동일) */}
        {interactive && isEditing ? (
          <input
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={handleTitleKeyDown}
            onPointerDown={(e) => e.stopPropagation()}
            autoFocus
            className="flex-1 min-w-0 bg-foreground/5 border border-foreground/10 rounded px-1.5 py-0.5 text-[13px] font-medium text-foreground outline-none focus:ring-2 focus:ring-bridge-accent/50"
          />
        ) : (
          <p
            onClick={startEditing}
            className={`flex-1 text-[13px] font-medium leading-snug break-words ${
              item.completed ? "line-through text-slate-500" : "text-foreground"
            } ${interactive ? "cursor-pointer" : ""}`}
          >
            {item.title}
          </p>
        )}

        {/* 이동/삭제 버튼 (호버 시 노출) */}
        {interactive && !isEditing && (
          <div className="flex items-center gap-0.5 flex-shrink-0 -mt-0.5 -mr-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onMoveToTask && (
              <button
                onClick={() => onMoveToTask(item.id)}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={t("task.moveChecklistToTask", {
                  defaultValue: "다른 태스크로 이동",
                })}
                title={t("task.moveChecklistToTask", {
                  defaultValue: "다른 태스크로 이동",
                })}
                className="p-1 rounded text-slate-500 hover:text-foreground hover:bg-foreground/10 transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(item.id)}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="삭제"
                className="p-1 rounded text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 메타: 날짜 / 담당자 / 타임블록 */}
      {(interactive ||
        range ||
        assigneeHex ||
        item.contractor ||
        est ||
        timeBlocks.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2 pl-6">
          {/* 날짜 — 클릭 시 기간 캘린더 (리스트뷰 동일) */}
          {interactive ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`inline-flex items-center gap-1 text-[11px] px-1 py-0.5 -mx-1 rounded hover:bg-foreground/10 transition-colors ${
                    overdue
                      ? "text-rose-500 font-bold"
                      : range
                        ? "text-slate-500"
                        : `text-slate-500 ${ghostTrigger}`
                  }`}
                >
                  <CalendarIcon className="w-3 h-3" />
                  {range || t("task.date", { defaultValue: "날짜" })}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0 bg-bridge-obsidian border-foreground/10"
                align="start"
              >
                <Calendar
                  mode="range"
                  selected={{
                    from: item.start_date
                      ? new Date(item.start_date)
                      : undefined,
                    to: item.due_date ? new Date(item.due_date) : undefined,
                  }}
                  defaultMonth={
                    item.start_date
                      ? new Date(item.start_date)
                      : item.due_date
                        ? new Date(item.due_date)
                        : undefined
                  }
                  onSelect={(r) => {
                    onUpdate?.(item.id, {
                      start_date: r?.from ? format(r.from, "yyyy-MM-dd") : null,
                      due_date: r?.to ? format(r.to, "yyyy-MM-dd") : null,
                    });
                  }}
                  numberOfMonths={1}
                  locale={ko}
                  className="bg-bridge-obsidian text-foreground"
                />
                {(item.start_date || item.due_date) && (
                  <div className="p-2 border-t border-foreground/10">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() =>
                        onUpdate?.(item.id, {
                          start_date: null,
                          due_date: null,
                        })
                      }
                    >
                      {t("task.deleteDate", { defaultValue: "날짜 삭제" })}
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          ) : (
            range && (
              <span
                className={`text-[11px] ${overdue ? "text-rose-500 font-bold" : "text-slate-500"}`}
              >
                {range}
              </span>
            )
          )}

          {/* 담당자/외주 — 클릭 시 선택 팝오버 (리스트뷰 동일, Personal 보드 숨김) */}
          {!isPersonal &&
            (interactive ? (
              <Popover>
                <PopoverTrigger asChild>
                  {item.contractor ? (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-0.5 px-1.5 h-[18px] rounded text-[10px] font-bold text-white flex-shrink-0 hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: contractorColor }}
                      title={item.contractor.name}
                    >
                      <Wrench className="w-2.5 h-2.5" />
                      {item.contractor.name}
                    </button>
                  ) : assigneeHex && item.assignee ? (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-[18px] h-[18px] rounded flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: assigneeHex }}
                      title={item.assignee.name}
                    >
                      {getInitials(item.assignee.name)}
                    </button>
                  ) : (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label={t("task.assignee", {
                        defaultValue: "담당자",
                      })}
                      className={`w-[18px] h-[18px] rounded-full bg-slate-600 flex items-center justify-center text-[10px] text-slate-300 flex-shrink-0 hover:bg-slate-500 transition-colors ${ghostTrigger}`}
                    >
                      ?
                    </button>
                  )}
                </PopoverTrigger>
                <PopoverContent
                  className="w-48 p-1 bg-bridge-obsidian border-foreground/10 max-h-72 overflow-y-auto custom-scrollbar"
                  align="start"
                >
                  <div className="space-y-0.5">
                    <button
                      onClick={() =>
                        onUpdate?.(item.id, { assignee: null, contractor: null })
                      }
                      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-foreground/10 transition-colors ${
                        !item.assignee && !item.contractor
                          ? "bg-foreground/10 text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {t("common.none", { defaultValue: "없음" })}
                    </button>
                    {boardMembers.map((member) => {
                      const hex = getAssigneeHex(
                        member.name,
                        member.assigneeColor,
                      );
                      return (
                        <button
                          key={member.userId}
                          onClick={() =>
                            onUpdate?.(item.id, {
                              assignee: {
                                id: member.userId,
                                name: member.name,
                                profile_image: member.avatar || null,
                              },
                              contractor: null,
                            })
                          }
                          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-foreground/10 transition-colors ${
                            item.assignee?.id === member.userId
                              ? "bg-foreground/10 text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                            style={{ backgroundColor: hex }}
                          >
                            {getInitials(member.name)}
                          </span>
                          {member.name}
                        </button>
                      );
                    })}
                    {contractors.length > 0 && (
                      <>
                        <div className="my-1 border-t border-foreground/[0.08]" />
                        <div className="px-2 py-1 text-xs font-bold uppercase tracking-widest text-slate-400">
                          {t("task.contractorSection", "외주 작업자")}
                        </div>
                        {contractors.map((c) => {
                          const color = c.color || "#6366F1";
                          return (
                            <button
                              key={c.id}
                              onClick={() =>
                                onUpdate?.(item.id, {
                                  assignee: null,
                                  contractor: {
                                    id: c.id,
                                    name: c.name,
                                    color: c.color,
                                  } as ContractorInfo,
                                })
                              }
                              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-foreground/10 transition-colors ${
                                item.contractor?.id === c.id
                                  ? "bg-foreground/10 text-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              <span
                                className="w-4 h-4 rounded-full border border-dashed flex items-center justify-center flex-shrink-0"
                                style={{
                                  backgroundColor: color + "15",
                                  borderColor: color + "66",
                                }}
                              >
                                <Wrench
                                  className="w-2.5 h-2.5"
                                  style={{ color }}
                                />
                              </span>
                              {c.name}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            ) : item.contractor ? (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 h-[18px] rounded text-[10px] font-bold text-white flex-shrink-0"
                style={{ backgroundColor: contractorColor }}
                title={item.contractor.name}
              >
                <Wrench className="w-2.5 h-2.5" />
                {item.contractor.name}
              </span>
            ) : (
              assigneeHex &&
              item.assignee && (
                <span
                  className="w-[18px] h-[18px] rounded flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: assigneeHex }}
                  title={item.assignee.name}
                >
                  {getInitials(item.assignee.name)}
                </span>
              )
            ))}

          {/* 타임블록 총합 + 상세 토글 (리스트뷰 동일) */}
          {!dragging ? (
            <button
              onClick={() => setShowTimeBlocks((v) => !v)}
              onPointerDown={(e) => e.stopPropagation()}
              title={t("task.viewTimeBlocks", {
                defaultValue: "타임블록 보기",
              })}
              className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1 py-0.5 -mx-1 rounded transition-colors ${
                showTimeBlocks || timeBlocks.length > 0
                  ? "text-bridge-secondary hover:bg-bridge-secondary/10"
                  : `text-slate-500 hover:bg-foreground/10 ${ghostTrigger}`
              }`}
            >
              {showTimeBlocks ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <Clock className="w-3 h-3" />
              )}
              {est}
            </button>
          ) : (
            est && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-bridge-secondary">
                <Clock className="w-3 h-3" />
                {est}
              </span>
            )
          )}
        </div>
      )}

      {/* 타임블록 상세 리스트 */}
      {showTimeBlocks && !dragging && (
        <div className="mt-1.5 pl-6 space-y-1">
          {timeBlocks.length === 0 ? (
            <div className="text-[11px] text-slate-500 py-0.5">
              {t("task.noTimeBlocks", {
                defaultValue: "등록된 타임블록이 없습니다",
              })}
            </div>
          ) : (
            timeBlocks.map((block) => (
              <div
                key={block.id}
                className="flex items-center gap-1.5 text-[11px] py-1 px-1.5 rounded bg-foreground/[0.04] border border-foreground/[0.06]"
              >
                <CalendarIcon className="w-3 h-3 text-slate-500 flex-shrink-0" />
                <span className="text-slate-500">
                  {format(new Date(block.scheduled_date), "M/d (E)", {
                    locale: ko,
                  })}
                </span>
                <Clock className="w-3 h-3 text-slate-500 flex-shrink-0" />
                <span className="text-foreground font-medium">
                  {block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}
                </span>
              </div>
            ))
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
  contractors?: BoardContractor[];
  timeBlocksMap: Record<string, ScheduleBlockDetailResponse[]>;
  today: string;
  isPersonal?: boolean;
  onToggle: (itemId: string) => void;
  onUpdate: (itemId: string, updates: Partial<ChecklistItem>) => void;
  onDelete: (itemId: string) => void;
  onMoveToTask?: (itemId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.item.id,
    disabled: !props.canEdit,
  });
  // 드래그 종료 직후 발생하는 click이 편집/팝오버를 여는 것을 차단
  const wasDraggedRef = useRef(false);
  if (isDragging) wasDraggedRef.current = true;
  return (
    <div
      ref={setNodeRef}
      {...(props.canEdit ? { ...listeners, ...attributes } : {})}
      onPointerDownCapture={() => {
        wasDraggedRef.current = false;
      }}
      onClickCapture={(e) => {
        if (wasDraggedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          wasDraggedRef.current = false;
        }
      }}
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
  contractors,
  timeBlocksMap,
  today,
  isPersonal,
  onToggle,
  onUpdate,
  onDelete,
  onMoveToTask,
  onQuickAdd,
}: {
  meta: (typeof COLUMN_META)[number];
  label: string;
  items: ChecklistItem[];
  canEdit: boolean;
  boardMembers: BoardMember[];
  contractors?: BoardContractor[];
  timeBlocksMap: Record<string, ScheduleBlockDetailResponse[]>;
  today: string;
  isPersonal?: boolean;
  onToggle: (itemId: string) => void;
  onUpdate: (itemId: string, updates: Partial<ChecklistItem>) => void;
  onDelete: (itemId: string) => void;
  onMoveToTask?: (itemId: string) => void;
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
            contractors={contractors}
            timeBlocksMap={timeBlocksMap}
            today={today}
            isPersonal={isPersonal}
            onToggle={onToggle}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onMoveToTask={onMoveToTask}
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
  contractors,
  timeBlocksMap,
  isPersonal,
  onToggle,
  onMoveColumn,
  onUpdateItem,
  onDelete,
  onMoveToTask,
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
            contractors={contractors}
            timeBlocksMap={timeBlocksMap}
            today={today}
            isPersonal={isPersonal}
            onToggle={onToggle}
            onUpdate={onUpdateItem}
            onDelete={onDelete}
            onMoveToTask={onMoveToTask}
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
            isPersonal={isPersonal}
            onToggle={onToggle}
            dragging
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
