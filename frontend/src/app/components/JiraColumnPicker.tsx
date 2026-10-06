import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { jiraAPI, taskAPI } from "../utils/api";
import type { JiraBlockRef } from "../utils/api";

interface JiraColumnPickerProps {
  boardId: string;
  taskId: string;
  /** 스코프 전용 미러를 고르기 위한 태스크의 마일스톤 (없으면 보드 미러) */
  milestoneId?: string | null;
  currentBlockId?: string | null;
  currentBlockName?: string | null;
  canEdit: boolean;
}

/**
 * JIRA 연동 태스크의 경로 마지막 칸 — 스프린트 대신 JIRA 보드 컬럼(미러 블록)을 보여주고 옮긴다.
 * 컬럼 목록·허용 전이는 팝오버를 열 때 조회한다(JIRA 뷰 드래그의 pre-block과 같은 규칙).
 */
export function JiraColumnPicker({
  boardId,
  taskId,
  milestoneId,
  currentBlockId,
  currentBlockName,
  canEdit,
}: JiraColumnPickerProps) {
  const [open, setOpen] = useState(false);
  // 선택 직후 표시용 — 모달의 task prop은 이동 후에도 갱신되지 않는다
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [columns, setColumns] = useState<JiraBlockRef[] | null>(null);
  const [allowed, setAllowed] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    setSelected(null);
    setColumns(null);
    setAllowed(null);
  }, [taskId]);

  const activeBlockId = selected?.id ?? currentBlockId ?? null;
  const activeName = selected?.name ?? currentBlockName ?? "—";

  useEffect(() => {
    if (!open || columns) return;
    let alive = true;
    setLoading(true);
    const mirrorOf = (blocks: JiraBlockRef[] | undefined) =>
      (blocks ?? []).filter((b) => !!b.jira_status_id);
    (async () => {
      try {
        // 스코프 전용 미러가 있으면 그 컬럼, 태스크 블록이 거기 없으면 보드 미러로 폴백
        let cols = mirrorOf(
          (await jiraAPI.getMeta(boardId, milestoneId ?? undefined)).blocks,
        );
        if (milestoneId && !cols.some((c) => c.id === currentBlockId)) {
          const boardCols = mirrorOf((await jiraAPI.getMeta(boardId)).blocks);
          if (boardCols.some((c) => c.id === currentBlockId)) cols = boardCols;
        }
        if (alive) setColumns(cols);
      } catch {
        if (alive) setColumns([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    jiraAPI
      .getTaskTransitions(boardId, taskId)
      .then((r) => {
        if (!alive) return;
        const allow = new Set(r.allowed_status_ids || []);
        if (r.current_status_id) allow.add(r.current_status_id);
        setAllowed(allow);
      })
      .catch(() => {
        /* 조회 실패 시 낙관적 허용 (JIRA 뷰와 동일) */
      });
    return () => {
      alive = false;
    };
  }, [open, columns, boardId, taskId, milestoneId, currentBlockId]);

  const isAllowed = (col: JiraBlockRef) => {
    if (col.id === activeBlockId || allowed == null) return true;
    const ids =
      col.jira_status_ids && col.jira_status_ids.length > 0
        ? col.jira_status_ids
        : [col.jira_status_id as string];
    return ids.some((s) => allowed.has(s));
  };

  // JIRA 뷰 드롭과 같은 경로: 블록 이동 → TaskBlockChangedEvent → JIRA 전이 push.
  // 부모 handleMoveTask는 현재 목록에 없는 태스크(마일스톤 필터 밖)면 조용히 무시해서 직접 호출한다.
  const moveTo = async (col: JiraBlockRef) => {
    const prev = selected;
    setSelected({ id: col.id, name: col.name });
    setOpen(false);
    setMoving(true);
    try {
      await taskAPI.moveTask(boardId, taskId, {
        target_block_id: col.id,
        position: 0,
      });
    } catch {
      setSelected(prev);
      toast.error("JIRA 컬럼 이동에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setMoving(false);
      setAllowed(null);
      setColumns(null); // 다음 열 때 전이 가능 상태 재조회
    }
  };

  const editable = canEdit && !moving;
  const trigger = (
    <button
      type="button"
      disabled={!editable}
      title="JIRA 보드 컬럼"
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-foreground/10 bg-foreground/5 text-foreground hover:bg-foreground/10 transition-colors disabled:cursor-default disabled:hover:bg-foreground/5"
    >
      <span className="text-xs font-bold text-bridge-accent">JIRA</span>
      {activeName}
      {moving ? (
        <Loader2 className="w-3 h-3 animate-spin text-bridge-accent" />
      ) : (
        canEdit && <ChevronDown className="w-3 h-3 opacity-60" />
      )}
    </button>
  );

  if (!editable) return trigger;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-1 max-h-72 overflow-y-auto custom-scrollbar"
      >
        {loading || !columns ? (
          <div className="flex justify-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
          </div>
        ) : columns.length === 0 ? (
          <p className="px-2.5 py-2 text-xs text-slate-500">
            JIRA 미러 컬럼이 없어 여기서 옮길 수 없습니다. JIRA 화면에서
            옮겨주세요.
          </p>
        ) : (
          columns.map((col) => {
            const isCurrent = col.id === activeBlockId;
            const ok = isAllowed(col);
            return (
              <button
                key={col.id}
                disabled={isCurrent || !ok}
                title={ok ? undefined : "JIRA에서 허용되지 않는 이동입니다"}
                onClick={() => void moveTo(col)}
                className={`w-full flex items-center gap-1.5 text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-foreground/10 disabled:cursor-default disabled:hover:bg-transparent ${
                  isCurrent
                    ? "text-bridge-accent font-bold"
                    : ok
                      ? "text-foreground"
                      : "text-slate-500 opacity-60"
                }`}
              >
                <span className="truncate">{col.name}</span>
                {isCurrent && (
                  <Check className="w-3 h-3 ml-auto flex-shrink-0" />
                )}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}
