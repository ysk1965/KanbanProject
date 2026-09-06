import { useState, useEffect } from "react";
import { Loader2, Diamond, Trash2 } from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import { jiraAPI } from "../utils/api";
import { formatDateTime } from "../utils/dateUtils";

interface JiraScopeModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  milestoneId: string;
  milestoneTitle?: string;
  /** 현재 활성 스코프 (없으면 null — 보드 전체를 보는 상태). */
  scope: {
    jql: string;
    task_count: number;
    last_claimed_at: string | null;
  } | null;
  /** 연결된 JIRA 프로젝트 키 — JQL 예시 조립용. */
  projectKey?: string | null;
  /** 저장/해제 성공 후 보드 재조회. */
  onSaved: () => void;
}

/**
 * 마일스톤 JIRA 스코프 설정 모달.
 *
 * 연결(계정·프로젝트)은 보드가 이미 갖고 있으므로, 여기서는 "이 마일스톤의 JIRA 뷰가
 * 무엇을 비출지"(JQL)만 정한다. 저장 즉시 서버가 JQL을 실행해 소속을 갱신하므로
 * JQL 오타는 저장 단계에서 바로 드러난다.
 */
export function JiraScopeModal({
  open,
  onClose,
  boardId,
  milestoneId,
  milestoneTitle,
  scope,
  projectKey,
  onSaved,
}: JiraScopeModalProps) {
  const [jql, setJql] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모달을 열 때마다 현재 스코프로 초기화 (닫힌 채 스코프가 바뀌어도 낡은 입력이 남지 않게)
  useEffect(() => {
    if (open) {
      setJql(scope?.jql ?? "");
      setError(null);
    }
  }, [open, scope?.jql]);

  const suggestions = [
    milestoneTitle ? `fixVersion = "${milestoneTitle}"` : null,
    milestoneTitle ? `labels = "${milestoneTitle}"` : null,
    projectKey
      ? `project = ${projectKey} AND created >= "2026-01-01"`
      : null,
  ].filter((s): s is string => !!s);

  const handleSave = async () => {
    if (!jql.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await jiraAPI.saveScope(boardId, milestoneId, jql.trim());
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "스코프 저장에 실패했습니다. JQL을 확인해주세요",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await jiraAPI.deleteScope(boardId, milestoneId);
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(
        e instanceof Error && e.message ? e.message : "스코프 해제에 실패했습니다",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-labelledby="jira-scope-title"
      className="w-full sm:max-w-md"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <span className="w-8 h-8 rounded-lg bg-bridge-accent/15 text-bridge-accent grid place-items-center shrink-0">
          <Diamond className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h4 id="jira-scope-title" className="text-sm font-bold text-foreground">
            마일스톤 JIRA 스코프
          </h4>
          <p className="text-xs text-slate-500 truncate">
            {milestoneTitle
              ? `${milestoneTitle}의 JIRA 뷰가 비출 범위를 정합니다`
              : "이 마일스톤의 JIRA 뷰가 비출 범위를 정합니다"}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4">
        <p className="text-xs text-slate-500 mb-3">
          연결된 JIRA 프로젝트 안에서 JQL로 좁힙니다. 비워두거나 해제하면 이
          마일스톤은 보드 전체를 봅니다.
        </p>

        <label
          htmlFor="jira-scope-jql"
          className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5"
        >
          JQL
        </label>
        <textarea
          id="jira-scope-jql"
          value={jql}
          onChange={(e) => setJql(e.target.value)}
          rows={3}
          placeholder={
            milestoneTitle ? `예: fixVersion = "${milestoneTitle}"` : "예: fixVersion = \"소프트런칭\""
          }
          className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3 text-sm text-foreground placeholder-slate-500 outline-none resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all font-mono"
        />

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setJql(s)}
                className="text-xs px-2 py-1 rounded-lg bg-foreground/5 border border-foreground/10 text-slate-400 hover:text-foreground hover:bg-foreground/10 transition-colors"
                title="이 JQL로 채우기"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {scope && (
          <p className="text-xs text-slate-600 mt-3 tabular-nums">
            현재 {scope.task_count}건 적용 중
            {scope.last_claimed_at
              ? ` · 마지막 동기화 ${formatDateTime(scope.last_claimed_at)}`
              : ""}
          </p>
        )}

        {error && (
          <p className="text-xs text-red-400 mt-3" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600">Esc 닫기</span>
          {scope && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
              스코프 해제
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!jql.trim() || isSaving || isDeleting}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
        >
          {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
          {isSaving ? "적용 중…" : "저장 후 적용"}
        </button>
      </div>
    </MotionModal>
  );
}
