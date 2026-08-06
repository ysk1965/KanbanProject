import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  History,
  Image as ImageIcon,
  User as UserIcon,
  Wrench,
  X,
} from "lucide-react";

import { MotionModal } from "./ui/MotionModal";
import { CommentPanel } from "./CommentPanel";
import { ChecklistHistoryModal } from "./ChecklistHistoryModal";
import type {
  BoardWebSocketEvent,
  ChecklistItem,
  TaskComment,
  User,
} from "../types";
import type { ScheduleBlockDetailResponse } from "../utils/api";
import { resolveFileUrl } from "../utils/api";
import type { BoardMember } from "./ShareBoardModal";
import { getAssigneeClasses, getInitials } from "../utils/assigneeColor";
import { formatDateShort, getDDay } from "../utils/dateUtils";

interface ChecklistDetailModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  taskId: string;
  /** 열려 있는 항목. 부모의 최신 상태를 그대로 받으므로 토글·수정이 즉시 반영된다. */
  item: ChecklistItem | null;
  taskTitle: string;
  featureName?: string | null;
  milestoneName?: string | null;
  boardMembers: BoardMember[];
  currentUser: User | null;
  canEdit?: boolean;
  isAdminOrOwner?: boolean;
  wsCommentEvent?: BoardWebSocketEvent | null;
  /** 이 항목에 붙은 타임블록 (부모가 이미 벌크로 받아둔 것) */
  timeBlocks?: ScheduleBlockDetailResponse[];
  onToggle?: () => void;
  /** 댓글 작성·삭제로 개수가 바뀌면 부모의 행 뱃지를 갱신한다. */
  onCommentCountChange?: (itemId: string, delta: number) => void;
  /** 열려 있는 동안 다른 사람이 항목을 지웠을 때. 창을 닫지 않고 쓰기만 막는다. */
  itemMissing?: boolean;
}

/**
 * 체크리스트 항목 디테일.
 *
 * <p>왼쪽은 항목 자체(담당자·기간·기록 시간·이미지), 오른쪽은 그 항목만의 대화다.
 * 태스크 모달이 쓰는 문법(왼쪽 내용 / 오른쪽 댓글)을 한 단계 아래에서 반복하므로
 * 사용자가 새로 배울 규칙이 없다.</p>
 *
 * <p>태스크 모달 위에 겹쳐 뜬다. {@code escStack}이 LIFO로 최상단만 닫으므로
 * ESC를 눌러도 뒤의 태스크 모달은 열려 있다.</p>
 */
export function ChecklistDetailModal({
  open,
  onClose,
  boardId,
  taskId,
  item,
  taskTitle,
  featureName,
  milestoneName,
  boardMembers,
  currentUser,
  canEdit = true,
  isAdminOrOwner = false,
  wsCommentEvent,
  timeBlocks,
  onToggle,
  onCommentCountChange,
  itemMissing = false,
}: ChecklistDetailModalProps) {
  const { t } = useTranslation();

  // hook은 전부 early return 위에 둔다 (React #310)
  const [showHistory, setShowHistory] = useState(false);
  const [scopedComments, setScopedComments] = useState<TaskComment[]>([]);

  const handleScopedComments = useCallback((comments: TaskComment[]) => {
    setScopedComments(comments);
  }, []);

  /**
   * 이 항목의 이미지 = 항목 댓글에 올라온 이미지 첨부.
   * 별도 저장소를 두지 않았으므로 갤러리는 대화의 파생물이다.
   */
  const images = useMemo(
    () =>
      scopedComments
        .flatMap((c) => c.attachments || [])
        .filter((att) => (att.content_type || "").startsWith("image/")),
    [scopedComments],
  );

  // 타임블록 합계는 행에서와 같은 방식으로 센다(응답에 분 단위 필드가 없어 시각 차로 계산)
  const totalMinutes = useMemo(
    () =>
      (timeBlocks || []).reduce(
        (sum, b) =>
          sum +
          Math.round(
            (new Date(`2000-01-01T${b.end_time}`).getTime() -
              new Date(`2000-01-01T${b.start_time}`).getTime()) /
              60000,
          ),
        0,
      ),
    [timeBlocks],
  );

  const assigneeColor = useMemo(() => {
    if (!item?.assignee) return null;
    const member = boardMembers.find((m) => m.userId === item.assignee!.id);
    return getAssigneeClasses(item.assignee.name, member?.assigneeColor);
  }, [item, boardMembers]);

  if (!item) return null;

  const dday = getDDay(item.due_date);
  const readOnly = !canEdit || itemMissing;

  const ddayClass =
    dday.urgency === "overdue"
      ? "text-rose-500 dark:text-rose-400"
      : dday.urgency === "today" || dday.urgency === "soon"
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-400";

  return (
    <>
      <MotionModal
        open={open}
        onClose={onClose}
        accentColor
        aria-label={t("checklistDetail.title", "항목 디테일")}
        // 바깥 스크롤을 끄고 좌우 칼럼이 각자 스크롤한다.
        // MotionModal 기본값이 overflow-y-auto라 이걸 덮지 않으면 스크롤이 두 겹이 된다.
        className="sm:max-w-3xl md:max-w-4xl max-h-[85dvh] p-0 flex flex-col overflow-hidden bg-bridge-obsidian"
      >
        {/* ── 헤더 ── */}
        <div className="flex-none px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onToggle?.()}
              aria-label={t("task.toggleChecklist", "완료 토글")}
              className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center flex-none transition-colors ${
                item.completed
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : "border-slate-500 text-transparent hover:border-bridge-accent"
              } ${readOnly ? "opacity-60 cursor-default" : ""}`}
            >
              <Check className="w-3 h-3" strokeWidth={3.5} />
            </button>

            <span
              className={`text-sm font-bold text-foreground flex-1 min-w-0 truncate ${
                item.completed || itemMissing
                  ? "line-through text-slate-500"
                  : ""
              }`}
              title={item.title}
            >
              {item.title}
            </span>

            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-400 bg-foreground/5 hover:bg-foreground/10 hover:text-foreground transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {t("checklistHistory.menu", "이력")}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close", "닫기")}
              className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 브레드크럼 — 디테일에서도 이 항목이 어느 맥락에 있는지 잃지 않는다 */}
          <div className="mt-1.5 pl-[30px] text-xs text-slate-500 truncate">
            <span className="text-slate-400 font-medium">{taskTitle}</span>
            {featureName ? ` · ${featureName}` : ""}
            {milestoneName ? ` · ${milestoneName}` : ""}
          </div>

          {itemMissing && (
            <div className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-3.5 h-3.5 flex-none" />
              <span className="text-xs font-bold">
                {t(
                  "checklistDetail.deletedBanner",
                  "삭제된 항목입니다 · 읽기만 가능합니다",
                )}
              </span>
            </div>
          )}
        </div>

        {/* ── 본문 ── */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* 왼쪽: 항목 정보 */}
          <div className="md:w-[316px] md:flex-none flex flex-col gap-4 p-4 md:border-r border-b md:border-b-0 border-foreground/[0.08] overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {t("checklistDetail.info", "항목 정보")}
              </span>
              <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-3.5 py-3 flex flex-col gap-2.5">
                {/* 담당자 */}
                <div className="flex items-center gap-2.5 text-xs">
                  <span className="w-14 flex-none text-slate-500">
                    {t("task.assignee", "담당자")}
                  </span>
                  {item.contractor ? (
                    <span className="inline-flex items-center gap-1 text-foreground">
                      <Wrench className="w-3 h-3" />
                      {item.contractor.name}
                    </span>
                  ) : item.assignee && assigneeColor ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`w-4 h-4 rounded-full ${assigneeColor.bg} flex items-center justify-center text-xs text-white`}
                        style={
                          !assigneeColor.bg
                            ? { backgroundColor: assigneeColor.hex }
                            : undefined
                        }
                      >
                        {getInitials(item.assignee.name)}
                      </span>
                      <span className="text-foreground">
                        {item.assignee.name}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <UserIcon className="w-3 h-3" />
                      {t("task.checklistFilter.unassigned", "미할당")}
                    </span>
                  )}
                </div>

                {/* 기간 */}
                <div className="flex items-center gap-2.5 text-xs">
                  <span className="w-14 flex-none text-slate-500">
                    {t("task.period", "기간")}
                  </span>
                  {item.start_date || item.due_date ? (
                    <span className="inline-flex items-center gap-1.5 text-foreground tabular-nums">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {item.start_date ? formatDateShort(item.start_date) : "—"}
                      {" → "}
                      {item.due_date ? formatDateShort(item.due_date) : "—"}
                      {dday.text && !item.completed && (
                        <span className={`font-bold ${ddayClass}`}>
                          {dday.text}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-500">
                      {t("task.noDate", "미정")}
                    </span>
                  )}
                </div>

                {/* 기록 시간 */}
                {totalMinutes > 0 && (
                  <div className="flex items-center gap-2.5 text-xs">
                    <span className="w-14 flex-none text-slate-500">
                      {t("task.timeBlockTotal", "기록 시간")}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-bridge-accent font-medium tabular-nums">
                      <Clock className="w-3 h-3" />
                      {Math.floor(totalMinutes / 60) > 0
                        ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60 > 0 ? `${totalMinutes % 60}m` : ""}`
                        : `${totalMinutes}m`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/*
              이미지 갤러리. 항목 직속 첨부가 아니라 댓글에 올라온 이미지를 모은 것이다.
              한 장도 없으면 섹션 자체를 그리지 않는다 — 빈 액자를 두지 않는다.
            */}
            {images.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {t("checklistDetail.gallery", "이미지 {{count}}", {
                      count: images.length,
                    })}
                  </span>
                  <span className="text-xs text-slate-500">
                    {t("checklistDetail.galleryHint", "댓글에 올라온 것")}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {images.slice(0, 4).map((att, idx) => {
                    const isLastSlot = idx === 3 && images.length > 4;
                    return (
                      <a
                        key={att.id}
                        href={resolveFileUrl(att.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative aspect-[7/6] rounded-lg overflow-hidden border border-foreground/[0.08] bg-foreground/[0.06] hover:border-foreground/[0.12] transition-colors"
                        title={att.file_name}
                      >
                        <img
                          src={resolveFileUrl(att.thumbnail_url || att.url)}
                          alt={att.file_name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                        {isLastSlot && (
                          <span className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs font-bold text-white">
                            +{images.length - 3}
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {images.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ImageIcon className="w-3.5 h-3.5" />
                {t(
                  "checklistDetail.noImages",
                  "댓글에 이미지를 올리면 여기 모입니다",
                )}
              </div>
            )}
          </div>

          {/* 오른쪽: 이 항목의 대화 */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="flex-none flex items-center justify-between gap-2 px-4 pt-3 pb-1">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {t("checklistDetail.comments", "댓글 {{count}}", {
                  count: scopedComments.length,
                })}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-slate-400 bg-foreground/5 hover:bg-foreground/10 hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                {t("checklistDetail.backToTask", "태스크 전체 보기")}
              </button>
            </div>

            {/*
              CommentPanel은 h-full로 부모를 채운다. 형제인 위 헤더와 같은 칸에 두면
              헤더 높이만큼 아래로 밀려 입력창이 화면 밖으로 나간다 — 남은 공간을 주는 칸을 하나 둔다.
            */}
            <div className="flex-1 min-h-0">
              <CommentPanel
                taskId={taskId}
                boardId={boardId}
                boardMembers={boardMembers}
                currentUser={currentUser}
                canEdit={!readOnly}
                isAdminOrOwner={isAdminOrOwner}
                wsCommentEvent={wsCommentEvent}
                checklistItemId={item.id}
                variant="embedded"
                onChecklistCommentCountChange={onCommentCountChange}
                onScopedCommentsChange={handleScopedComments}
              />
            </div>
          </div>
        </div>
      </MotionModal>

      {/* 변경 이력 — 태스크 › 디테일 › 이력 3단이지만 escStack이 최상단만 닫는다 */}
      <ChecklistHistoryModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        boardId={boardId}
        itemId={item.id}
        itemTitle={item.title}
      />
    </>
  );
}
