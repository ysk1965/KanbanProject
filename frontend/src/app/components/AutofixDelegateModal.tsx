import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent } from "react";
import {
  AlertTriangle,
  Check,
  FileVideo,
  ImagePlus,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import { fileAPI, jiraAutofixAPI, JiraAutofixJob } from "../utils/api";
import { ChecklistItem } from "../types";
import { useAutofixRunnerStatus } from "../hooks/useAutofixRunnerStatus";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";

/**
 * 태스크나 체크리스트 항목을 맥(자동수정 러너)에 맡기는 모달.
 *
 * <p>진입점은 둘이지만 화면은 하나다 — 체크리스트 항목 메뉴에서 열면 그 항목이 선택된 채로,
 * 태스크 헤더에서 열면 범위를 고르는 채로 열린다. 화면을 둘로 나누면 제약 안내와 러너 상태 확인이
 * 두 곳에서 각각 낡는다.
 *
 * <p>맡길 수 없는 사유는 <b>열자마자</b> 띄운다. 제출한 뒤에 알려주면 사용자는 지시문을 다 쓰고
 * 나서 막힌다.
 */

interface AutofixDelegateModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  taskId: string;
  taskTitle: string;
  /** 이 태스크의 체크리스트. 비어 있으면 선택 영역이 통째로 빠지고 태스크 위임만 남는다. */
  checklistItems: ChecklistItem[];
  /** 항목 메뉴에서 열었을 때 미리 선택할 항목. */
  initialItemId?: string | null;
  /** 이미 맡겨져 진행 중인 항목 — 선택할 수 없다(같은 대상으로 PR이 둘 열리면 안 된다). */
  pendingByChecklistItem?: Map<string, JiraAutofixJob>;
  onDelegated?: (queued: number) => void;
}

/** 아직 결과가 정해지지 않은 상태 = 지금 맡길 수 없는 항목. */
const LIVE_STATUSES = new Set(["QUEUED", "DISPATCHED"]);

/**
 * 함께 보낼 자료의 상한. 서버(autofix.max-delegate-*)와 같은 값을 둔다 —
 * 여기서 막지 않으면 사용자는 10MB짜리를 다 올린 뒤 제출 단계에서 거절당한다.
 */
const MAX_FILES = 3;
const MAX_FILE_MB = 10;

/** 첨부 한 건의 화면 상태. tempKey가 있어야 제출에 실을 수 있다. */
interface DelegateAttachment {
  /** 화면 전용 키 — 같은 파일을 두 번 골라도 행이 섞이지 않게 한다. */
  localId: string;
  name: string;
  isVideo: boolean;
  /** 로컬 미리보기(ObjectURL). 닫을 때 반드시 회수한다. */
  previewUrl: string;
  tempKey: string | null;
  uploading: boolean;
  failed: boolean;
}

export function AutofixDelegateModal({
  open,
  onClose,
  boardId,
  taskId,
  taskTitle,
  checklistItems,
  initialItemId,
  pendingByChecklistItem,
  onDelegated,
}: AutofixDelegateModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<DelegateAttachment[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** 미리보기 URL 회수와 개수 검사에 필요하다 — 둘 다 setState 콜백 밖에서 일어난다. */
  const attachmentsRef = useRef<DelegateAttachment[]>([]);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const runner = useAutofixRunnerStatus(boardId, open);

  // 열 때마다 초기화한다. 이전에 쓰다 만 지시문이 다른 항목에 붙는 사고를 막는다.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialItemId ? [initialItemId] : []));
    setInstruction("");
    setError(null);
    attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
    void runner.refresh();
    // runner.refresh는 매 렌더 새로 만들어지므로 의존성에서 뺀다 — 넣으면 무한 루프가 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialItemId]);

  // 언마운트될 때도 회수한다. 카드를 여러 번 여닫으면 ObjectURL이 탭이 살아 있는 내내 쌓인다.
  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    };
  }, []);

  const lockedIds = useMemo(() => {
    const locked = new Set<string>();
    pendingByChecklistItem?.forEach((job, itemId) => {
      if (LIVE_STATUSES.has(job.status)) locked.add(itemId);
    });
    return locked;
  }, [pendingByChecklistItem]);

  const toggle = useCallback(
    (itemId: string) => {
      if (lockedIds.has(itemId)) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        return next;
      });
    },
    [lockedIds],
  );

  /**
   * 고른 파일을 곧바로 임시 저장소로 올린다.
   *
   * <p>제출 순간에 몰아서 올리지 않는 이유 — 영상 한 편이 10MB면 버튼을 누른 뒤 수 초간
   * 아무 일도 일어나지 않는 것처럼 보이고, 그 사이 실패하면 지시문을 다 쓴 화면에서 막힌다.
   */
  const addFiles = useCallback((picked: File[]) => {
    if (picked.length === 0) return;

    const room = MAX_FILES - attachmentsRef.current.length;
    if (room <= 0) {
      setError(`첨부는 ${MAX_FILES}개까지만 올릴 수 있습니다`);
      return;
    }

    const accepted: { att: DelegateAttachment; file: File }[] = [];
    let tooLarge = false;
    let notMedia = false;

    for (const file of picked) {
      if (accepted.length >= room) break;
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      if (!isImage && !isVideo) {
        notMedia = true;
        continue;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        tooLarge = true;
        continue;
      }
      accepted.push({
        att: {
          localId: `${file.name}-${file.lastModified}-${accepted.length}-${performance.now()}`,
          name: file.name,
          isVideo,
          previewUrl: URL.createObjectURL(file),
          tempKey: null,
          uploading: true,
          failed: false,
        },
        file,
      });
    }

    // 무엇이 빠졌는지 말해준다. 조용히 버리면 사용자는 첨부가 나갔다고 믿는다.
    setError(
      tooLarge
        ? `${MAX_FILE_MB}MB가 넘는 파일은 빼고 올렸습니다`
        : notMedia
          ? "이미지나 영상만 올릴 수 있습니다"
          : picked.length > room
            ? `${MAX_FILES}개까지만 올릴 수 있어 나머지는 뺐습니다`
            : null,
    );

    if (accepted.length === 0) return;
    setAttachments((prev) => [...prev, ...accepted.map((a) => a.att)]);

    for (const { att, file } of accepted) {
      fileAPI
        .smartUpload(file)
        .then(({ tempKey }) =>
          setAttachments((prev) =>
            prev.map((a) =>
              a.localId === att.localId
                ? { ...a, tempKey, uploading: false }
                : a,
            ),
          ),
        )
        .catch(() =>
          setAttachments((prev) =>
            prev.map((a) =>
              a.localId === att.localId
                ? { ...a, uploading: false, failed: true }
                : a,
            ),
          ),
        );
    }
  }, []);

  const handlePick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      addFiles(Array.from(e.target.files ?? []));
      // 같은 파일을 지웠다가 다시 고를 수 있어야 한다 — 비우지 않으면 change가 안 뜬다.
      e.target.value = "";
    },
    [addFiles],
  );

  /** 스크린샷은 대개 클립보드에 있다. 지시문 칸에 그대로 붙여넣는 것이 가장 짧은 동선이다. */
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.clipboardData.files);
      if (files.length === 0) return;
      e.preventDefault();
      addFiles(files);
    },
    [addFiles],
  );

  const removeAttachment = useCallback((localId: string) => {
    const target = attachmentsRef.current.find((a) => a.localId === localId);
    if (target) URL.revokeObjectURL(target.previewUrl);
    setAttachments((prev) => prev.filter((a) => a.localId !== localId));
  }, []);

  const wholeTask = selected.size === 0;
  const uploadingFiles = attachments.some((a) => a.uploading);
  const failedFiles = attachments.some((a) => a.failed);
  /*
   * 올리다 실패한 첨부가 하나라도 있으면 보내지 않는다. 그냥 빼고 보내면 사용자는 "이 화면을
   * 보고 고쳐 달라"고 써 놓고 그림 없이 나간 것을 모른다.
   */
  const canSubmit =
    runner.canDelegate &&
    instruction.trim().length > 0 &&
    !submitting &&
    !uploadingFiles &&
    !failedFiles;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const fileKeys = attachments
        .map((a) => a.tempKey)
        .filter((k): k is string => !!k);

      const result = await jiraAutofixAPI.delegate(boardId, {
        task_id: taskId,
        checklist_item_ids: wholeTask ? [] : Array.from(selected),
        instruction: instruction.trim(),
        file_keys: fileKeys.length > 0 ? fileKeys : undefined,
      });
      onDelegated?.(result.queued);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "맡기지 못했습니다");
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    boardId,
    taskId,
    wholeTask,
    selected,
    instruction,
    attachments,
    onDelegated,
    onClose,
  ]);

  const submitLabel = wholeTask ? "맡기기" : `${selected.size}건 맡기기`;

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label="맥에 맡기기"
      className="w-full sm:max-w-md"
    >
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <Sparkles className="w-4 h-4 text-bridge-accent shrink-0" />
        <span className="text-sm font-bold text-foreground">맥에 맡기기</span>
        {runner.status?.runner_name && (
          <span className="ml-auto text-xs text-slate-500 truncate">
            {runner.status.runner_name}
          </span>
        )}
      </div>

      <div className="px-5 pb-5 pt-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
        {runner.blockedReason && (
          <div className="flex gap-2 items-start px-3 py-2.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed">{runner.blockedReason}</p>
          </div>
        )}

        {/*
          라벨이 "대상"이 아니라 "맥락으로 함께 나갑니다"인 이유 — 체크리스트 항목을 맡길 때
          사용자가 가장 먼저 걱정하는 것은 "이 한 줄만 보내면 알아듣나"다. 체크리스트 항목에는
          설명 필드가 없어 제목 한 줄이 전부라, 맥락은 실제로 이 카드가 채운다.
        */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
            맥락으로 함께 나갑니다
          </p>
          <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2.5">
            <p className="text-xs font-medium text-foreground line-clamp-2">
              {taskTitle}
            </p>
            {runner.status?.repo_full_name && (
              <p className="text-xs text-slate-500 mt-1 break-all">
                {runner.status.repo_full_name}
              </p>
            )}
          </div>
        </div>

        {checklistItems.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                무엇을 맡길까요
              </p>
              <span className="ml-auto text-xs text-bridge-accent font-bold tabular-nums">
                {wholeTask ? "태스크 전체" : `${selected.size}개 선택`}
              </span>
            </div>

            <div className="rounded-xl border border-foreground/10 overflow-hidden">
              {checklistItems.map((item) => {
                const locked = lockedIds.has(item.id);
                const pending = pendingByChecklistItem?.get(item.id);
                const on = selected.has(item.id);
                const hex = item.assignee
                  ? getAssigneeHex(item.assignee.name)
                  : null;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    disabled={locked}
                    aria-pressed={on}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-foreground/[0.06] last:border-b-0 transition-colors ${
                      locked
                        ? "opacity-50 cursor-default"
                        : on
                          ? "bg-bridge-accent/[0.07] hover:bg-bridge-accent/10"
                          : "hover:bg-foreground/5"
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded shrink-0 border grid place-items-center ${
                        on
                          ? "bg-bridge-accent border-bridge-accent"
                          : "border-slate-500"
                      } ${locked ? "invisible" : ""}`}
                    >
                      {on && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>

                    <span
                      className={`text-xs truncate ${
                        item.completed
                          ? "text-slate-500 line-through"
                          : "text-foreground"
                      }`}
                    >
                      {item.title}
                    </span>

                    <span className="ml-auto flex items-center gap-1.5 shrink-0">
                      {item.completed && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-foreground/10 text-slate-400">
                          완료
                        </span>
                      )}
                      {locked && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                          {pending?.status === "DISPATCHED"
                            ? "맥 작업 중"
                            : "맥 대기"}
                        </span>
                      )}
                      {/* 담당자는 대개 맡기는 사람 자신이다. 막지 않고 보여주기만 한다. */}
                      {hex && item.assignee && (
                        <span
                          className="w-4 h-4 rounded-full grid place-items-center text-xs font-bold text-white"
                          style={{ backgroundColor: hex }}
                          title={item.assignee.name}
                        >
                          {getInitials(item.assignee.name)}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              아무것도 고르지 않으면 태스크 전체를 맡깁니다.
            </p>
          </div>
        )}

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
            무엇을 시킬까요
          </p>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onPaste={handlePaste}
            disabled={!runner.canDelegate}
            maxLength={4000}
            rows={4}
            placeholder="예) 이름이 공백이거나 비어 있으면 저장을 막는다. 기존 프리셋을 수정할 때도 같은 규칙을 적용한다."
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3
              text-sm text-foreground placeholder-slate-500 outline-none resize-none
              focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all
              disabled:opacity-50"
          />
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-slate-500 leading-relaxed">
              {selected.size > 1
                ? `선택한 ${selected.size}개 항목에 같은 지시${
                    attachments.length > 0 ? "와 자료가" : "가"
                  } 전달됩니다.`
                : ""}
            </p>
            <span className="text-xs text-slate-500 tabular-nums">
              {instruction.length} / 4000
            </span>
          </div>
        </div>

        {/*
          자료를 지시문 바로 아래 둔다 — "이 화면을 보고 고쳐 달라"는 문장과 그 화면은 한 덩어리라,
          제약 안내 뒤로 밀면 지시문을 다 쓰고 나서야 첨부할 수 있다는 걸 알게 된다.
        */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              무엇을 보여줄까요
            </p>
            <span className="ml-auto text-xs text-slate-500 tabular-nums">
              {attachments.length} / {MAX_FILES}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div
                key={att.localId}
                className={`relative w-20 h-20 rounded-xl overflow-hidden border ${
                  att.failed ? "border-rose-500/50" : "border-foreground/10"
                } bg-foreground/[0.03]`}
              >
                {att.isVideo ? (
                  <div className="w-full h-full grid place-items-center text-slate-400">
                    <FileVideo className="w-6 h-6" />
                  </div>
                ) : (
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    className="w-full h-full object-cover"
                  />
                )}

                {/* 올라가는 중과 실패를 타일 위에 덮는다. 목록 밖에 적으면 어느 파일인지 알 수 없다. */}
                {att.uploading && (
                  <div className="absolute inset-0 grid place-items-center bg-bridge-obsidian/70">
                    <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
                  </div>
                )}
                {att.failed && (
                  <div className="absolute inset-0 grid place-items-center bg-bridge-obsidian/75">
                    <span className="text-xs font-bold text-rose-500">실패</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removeAttachment(att.localId)}
                  aria-label={`${att.name} 첨부 빼기`}
                  className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-full
                    bg-bridge-obsidian/80 text-slate-400 hover:text-foreground transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>

                <span
                  className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 text-xs text-slate-400
                    bg-bridge-obsidian/85 truncate"
                  title={att.name}
                >
                  {att.name}
                </span>
              </div>
            ))}

            {attachments.length < MAX_FILES && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!runner.canDelegate}
                aria-label="이미지나 영상 첨부"
                className="w-20 h-20 rounded-xl border border-dashed border-foreground/[0.18]
                  grid place-items-center text-slate-500 hover:text-bridge-accent
                  hover:border-bridge-accent/40 hover:bg-foreground/5 transition-colors
                  disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <ImagePlus className="w-5 h-5" />
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handlePick}
            className="hidden"
          />

          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            {failedFiles
              ? "올리지 못한 첨부가 있습니다. 빼거나 다시 올려주세요."
              : `스크린샷은 지시문 칸에 붙여넣어도 됩니다. 영상은 장면을 뽑아 함께 봅니다 (파일당 ${MAX_FILE_MB}MB).`}
          </p>
        </div>

        {/*
          지울 수 없는 제약을 접어서 보여준다. 숨기면 사용자는 "리팩터링도 같이 해줘"라고 써놓고
          왜 안 됐는지 모른다. 매번 읽을 내용은 아니므로 기본은 접어둔다.
        */}
        <details className="rounded-xl border border-foreground/[0.08]">
          <summary className="px-3 py-2 text-xs text-slate-400 cursor-pointer hover:text-foreground transition-colors">
            자동으로 붙는 제약
          </summary>
          <div className="px-3 pb-3 pt-1 text-xs text-slate-400 leading-relaxed border-t border-foreground/[0.06]">
            아래는 지시문과 함께 항상 전달되며 지울 수 없습니다.
            <ul className="list-disc pl-4 mt-1.5 space-y-0.5">
              <li>지시와 직접 관련된 최소 변경만 — 리팩터링·정리·포맷팅 금지</li>
              <li>에셋 바이너리(.unity, .prefab, .asset) 수정 금지</li>
              <li>워크플로 파일(.github/) 수정 금지</li>
              <li>기대 동작이 확정되지 않으면 고치지 않고 이유를 남기고 종료</li>
              {!wholeTask && <li>고른 항목 외에 다른 항목은 건드리지 않음</li>}
            </ul>
            <p className="mt-2 text-slate-500">
              허용 도구 — Read, Grep, Glob, Edit, Unity MCP (터미널 없음)
            </p>
          </div>
        </details>

        {!wholeTask && selected.size > 1 && (
          <div className="flex gap-2 items-start px-3 py-2.5 rounded-xl bg-foreground/[0.03] text-slate-400">
            <p className="text-xs leading-relaxed">
              항목마다 <b className="text-foreground">PR이 따로</b> 열립니다.
              하나가 실패해도 나머지는 그대로 진행됩니다.
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-500 leading-relaxed">{error}</p>
        )}
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">Esc 닫기</span>
        <div className="flex items-center gap-2.5">
          {/* 버튼이 꺼져 있는 이유를 옆에 둔다 — 이유 없이 눌리지 않는 버튼은 고장으로 읽힌다. */}
          <span className="text-xs text-slate-600">
            {uploadingFiles ? "첨부 올리는 중" : "PR까지만 만듭니다"}
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white
              bg-bridge-accent hover:bg-bridge-accent/90 transition-all disabled:opacity-45
              disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}
