import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  Check,
  ChevronRight,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";

import type { ChecklistItem, Task } from "../types";
import { MotionModal } from "./ui/MotionModal";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";
import { formatDate, getTodayDateString } from "../utils/dateUtils";
import { isChecklistOverdue } from "../utils/checklistStatus";
import { checklistService } from "../utils/services";

/** 모달 한 줄이 가리키는 지연 항목 — 어느 태스크의 무엇인지까지 들고 있어야 클릭이 카드로 이어진다. */
interface OverdueRow {
  itemId: string;
  title: string;
  taskId: string;
  taskTitle: string;
  dueDate: string;
  overdueDays: number;
}

interface OverdueGroup {
  /** 담당자 표시 이름. 미배정이면 null. */
  assignee: string | null;
  rows: OverdueRow[];
}

const UNASSIGNED = "__unassigned__";

/** 오늘 − 마감(일). 마감이 미래면 0. */
function daysOverdue(dueDate: string, today: string): number {
  const diff = Date.parse(today) - Date.parse(dueDate);
  if (Number.isNaN(diff) || diff <= 0) return 0;
  return Math.floor(diff / 86_400_000);
}

/**
 * 보드에 쌓인 지연 체크리스트를 담당자별로 세우고, <b>그 자리에서 처리까지</b> 하게 한다 —
 * 완료 체크, 마감 미루기, 삭제. 카드를 열어야만 손댈 수 있으면 12건을 정리하는 데 모달을
 * 12번 여닫아야 한다.
 *
 * <p>보고서·슬랙의 "지연 N건" 진입점이 착지하는 곳이다. 지연은 <b>체크리스트 단위</b>인데 칸반
 * 카드는 태스크 단위라, 필터된 보드에 떨어뜨리면 "어느 카드의 어느 줄이 늦었나"를 사람이 다시
 * 찾아야 한다. 그 탐색을 없애려고 항목을 직접 세운다.
 *
 * <p>데이터는 보드가 이미 들고 있는 것(tasks + checklistDataMap)으로만 만든다 — 추가 조회가
 * 없으니 링크를 타고 들어온 순간 바로 그려진다. 처리 결과는 {@code onItemsChanged}로 보드에
 * 돌려주므로, 완료·미루기로 지연이 풀린 줄은 이 목록에서 곧바로 사라진다.
 */
export function OverdueChecklistModal({
  open,
  onClose,
  boardId,
  tasks,
  checklistDataMap,
  canEdit = false,
  isLoading = false,
  onSelect,
  onItemsChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  tasks: Task[];
  checklistDataMap: { [taskId: string]: ChecklistItem[] };
  /** 편집 권한이 없으면 처리 액션을 감추고 읽기 전용 목록으로 둔다. */
  canEdit?: boolean;
  /**
   * 보드 데이터가 아직 오는 중인지. 딥링크로 들어오면 이 모달이 데이터보다 먼저 뜨는데,
   * 그때 "지연 없음"을 보여주면 사실과 정반대되는 안심을 주게 된다.
   */
  isLoading?: boolean;
  /** 항목 선택 → 그 태스크 모달을 열고 해당 체크리스트 줄을 하이라이트한다. */
  onSelect: (taskId: string, checklistItemId: string) => void;
  /** 처리 결과를 보드 상태에 반영한다(TaskDetailModal의 체크리스트 동기화와 같은 계약). */
  onItemsChanged?: (taskId: string, items: ChecklistItem[]) => void;
}) {
  // 삭제는 되돌릴 수 없어 두 번 누르게 한다 — 모달 위에 확인 모달을 겹치지 않으려고 행 안에서 묻는다.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const { groups, total } = useMemo(() => {
    const today = getTodayDateString();
    const byAssignee = new Map<string, OverdueGroup>();
    let count = 0;

    for (const task of tasks) {
      for (const item of checklistDataMap[task.id] ?? []) {
        if (!isChecklistOverdue(item, today) || !item.due_date) continue;
        const key = item.assignee?.name ?? UNASSIGNED;
        let group = byAssignee.get(key);
        if (!group) {
          group = { assignee: item.assignee?.name ?? null, rows: [] };
          byAssignee.set(key, group);
        }
        group.rows.push({
          itemId: item.id,
          title: item.title,
          taskId: task.id,
          taskTitle: task.title,
          dueDate: item.due_date,
          overdueDays: daysOverdue(item.due_date, today),
        });
        count += 1;
      }
    }

    // 많이 밀린 사람이 위로, 각 사람 안에서는 오래 지난 것이 위로. 미배정은 항상 맨 아래.
    const sorted = [...byAssignee.values()]
      .map((g) => ({
        ...g,
        rows: [...g.rows].sort((a, b) => b.overdueDays - a.overdueDays),
      }))
      .sort((a, b) => {
        if ((a.assignee === null) !== (b.assignee === null)) {
          return a.assignee === null ? 1 : -1;
        }
        return b.rows.length - a.rows.length;
      });

    return { groups: sorted, total: count };
  }, [tasks, checklistDataMap]);

  /**
   * 낙관적으로 먼저 반영하고, 실패하면 원래 목록으로 되돌린다. 지연 목록은 처리할 때마다 줄이
   * 사라지는 화면이라, 왕복을 기다리면 연달아 처리하는 흐름이 매번 끊긴다.
   */
  const mutate = async (
    row: OverdueRow,
    next: (items: ChecklistItem[]) => ChecklistItem[],
    call: () => Promise<unknown>,
    successMessage: string,
    failMessage: string,
  ) => {
    const prevItems = checklistDataMap[row.taskId] ?? [];
    setBusyItemId(row.itemId);
    onItemsChanged?.(row.taskId, next(prevItems));
    try {
      await call();
      toast.success(successMessage);
    } catch {
      onItemsChanged?.(row.taskId, prevItems);
      toast.error(failMessage);
    } finally {
      setBusyItemId(null);
    }
  };

  const completeRow = (row: OverdueRow) =>
    mutate(
      row,
      (items) =>
        items.map((i) => (i.id === row.itemId ? { ...i, completed: true } : i)),
      () => checklistService.toggleItem(boardId, row.taskId, row.itemId),
      `완료 · ${row.title}`,
      "완료 처리에 실패했습니다",
    );

  const changeDue = (row: OverdueRow, due: string | null) => {
    if (due === row.dueDate) return;
    return mutate(
      row,
      (items) =>
        items.map((i) => (i.id === row.itemId ? { ...i, due_date: due } : i)),
      () =>
        checklistService.updateItem(boardId, row.taskId, row.itemId, {
          due_date: due,
        }),
      due ? `마감 ${formatDate(due)}로 변경` : "마감일을 지웠습니다",
      "마감일 변경에 실패했습니다",
    );
  };

  const deleteRow = (row: OverdueRow) => {
    setPendingDeleteId(null);
    return mutate(
      row,
      (items) => items.filter((i) => i.id !== row.itemId),
      () => checklistService.deleteItem(boardId, row.taskId, row.itemId),
      `삭제 · ${row.title}`,
      "삭제에 실패했습니다",
    );
  };

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      aria-label="지연된 체크리스트"
      className="sm:max-w-lg p-0 overflow-hidden max-h-[80dvh] flex flex-col"
      accentColor
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        <div className="flex flex-col min-w-0 flex-1">
          <h2 className="text-sm md:text-lg font-bold text-foreground tracking-tight">
            {isLoading ? "지연 항목" : `지연 ${total}건`}
          </h2>
          <span className="text-xs text-slate-500">
            {isLoading
              ? "보드를 불러오는 중"
              : `마감이 지난 체크리스트 · 담당 ${groups.length}명`}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="text-slate-400 hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-5 pt-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        ) : total === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            지연된 체크리스트가 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((group) => {
              const name = group.assignee ?? "미배정";
              const hex = getAssigneeHex(name);
              return (
                <section key={name} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="shrink-0 w-6 h-6 rounded-lg grid place-items-center text-xs font-bold"
                      style={{ backgroundColor: `${hex}33`, color: hex }}
                    >
                      {getInitials(name)}
                    </span>
                    <span className="text-xs font-bold text-foreground truncate">
                      {name}
                    </span>
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 tabular-nums">
                      {group.rows.length}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {group.rows.map((row) => (
                      <OverdueRowItem
                        key={row.itemId}
                        row={row}
                        canEdit={canEdit}
                        busy={busyItemId === row.itemId}
                        confirmingDelete={pendingDeleteId === row.itemId}
                        onConfirmDelete={() => setPendingDeleteId(row.itemId)}
                        onCancelDelete={() => setPendingDeleteId(null)}
                        onDelete={() => deleteRow(row)}
                        onComplete={() => completeRow(row)}
                        onChangeDue={(due) => changeDue(row, due)}
                        onOpen={() => onSelect(row.taskId, row.itemId)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">Esc 닫기</span>
        <span className="text-xs text-slate-600">
          {canEdit ? "제목을 누르면 카드가 열립니다" : "읽기 전용"}
        </span>
      </div>
    </MotionModal>
  );
}

/**
 * 지연 항목 한 줄. 제목은 카드로, 왼쪽 체크박스는 완료로, 날짜 칩은 마감 변경으로, 휴지통은
 * 삭제로 간다. 행 전체를 버튼으로 감싸면 이 액션들을 버튼 안에 중첩하게 되므로 영역을 나눈다.
 */
function OverdueRowItem({
  row,
  canEdit,
  busy,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onComplete,
  onChangeDue,
  onOpen,
}: {
  row: OverdueRow;
  canEdit: boolean;
  busy: boolean;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onComplete: () => void;
  onChangeDue: (due: string | null) => void;
  onOpen: () => void;
}) {
  if (confirmingDelete) {
    return (
      <li className="flex items-center gap-2 px-2 py-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.06]">
        <span className="min-w-0 flex-1 text-xs text-foreground truncate">
          "{row.title}" 삭제할까요?
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs font-bold px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
        >
          삭제
        </button>
        <button
          type="button"
          onClick={onCancelDelete}
          className="text-xs font-bold px-2.5 py-1 rounded-lg text-slate-400 hover:bg-foreground/10 hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
        >
          취소
        </button>
      </li>
    );
  }

  return (
    <li
      className={`group flex items-start gap-2 px-2 py-2 rounded-lg border border-foreground/[0.08] hover:border-foreground/[0.12] hover:bg-foreground/5 transition-colors ${
        busy ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {/* 완료 — 지연 목록에서 가장 흔한 다음 행동이라 가장 큰 타겟(체크박스)에 둔다 */}
      {canEdit ? (
        <button
          type="button"
          onClick={onComplete}
          aria-label={`${row.title} 완료 처리`}
          className="mt-0.5 shrink-0 w-4 h-4 rounded border border-rose-500/60 grid place-items-center hover:bg-emerald-500 hover:border-emerald-500 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
        >
          <Check
            className="w-2.5 h-2.5 text-white opacity-0 group-hover:opacity-60"
            strokeWidth={3.5}
          />
        </button>
      ) : (
        <span className="mt-0.5 shrink-0 w-4 h-4 rounded border border-rose-500/60" />
      )}

      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <button
          type="button"
          onClick={onOpen}
          className="text-sm text-foreground truncate text-left hover:text-bridge-accent transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 rounded"
        >
          {row.title}
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 truncate max-w-[55%]">
            {row.taskTitle}
          </span>
          {canEdit ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs px-1 py-0.5 -mx-1 rounded hover:bg-foreground/10 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                >
                  <CalendarIcon className="w-3 h-3 text-slate-500" />
                  <span className="text-slate-500">
                    마감 {formatDate(row.dueDate)}
                  </span>
                  {row.overdueDays > 0 && (
                    <span className="text-rose-600 dark:text-rose-400 font-bold">
                      · {row.overdueDays}일 지남
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0 bg-bridge-obsidian border-foreground/10"
                align="start"
              >
                <Calendar
                  mode="single"
                  selected={new Date(row.dueDate)}
                  defaultMonth={new Date(row.dueDate)}
                  onSelect={(d) =>
                    onChangeDue(d ? format(d, "yyyy-MM-dd") : null)
                  }
                  numberOfMonths={1}
                  locale={ko}
                  className="bg-bridge-obsidian text-foreground"
                />
              </PopoverContent>
            </Popover>
          ) : (
            <span className="text-xs text-slate-500">
              마감 {formatDate(row.dueDate)}
              {row.overdueDays > 0 && (
                <span className="text-rose-600 dark:text-rose-400 font-bold">
                  {" "}
                  · {row.overdueDays}일 지남
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={onConfirmDelete}
          aria-label={`${row.title} 삭제`}
          className="shrink-0 mt-0.5 text-slate-500 opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-all focus:outline-none focus:opacity-100 focus:ring-2 focus:ring-bridge-accent/50 rounded"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${row.title} 카드 열기`}
        className="shrink-0 mt-0.5 text-slate-500 hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 rounded"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </li>
  );
}
