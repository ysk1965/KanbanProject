import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Diamond,
  Trash2,
  Check,
  ChevronLeft,
  Filter,
  FolderGit2,
  Copy,
} from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import {
  jiraAPI,
  JiraMilestoneScope,
  JiraAgileBoard,
  JiraNameRef,
} from "../utils/api";
import { formatDateTime } from "../utils/dateUtils";

interface JiraScopeModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  milestoneId: string;
  milestoneTitle?: string;
  /** 복사 소스 라벨용 — 보드의 마일스톤 목록(id → 제목). */
  milestones: { id: string; title: string }[];
  /** 연결된 보드 기본 JIRA 프로젝트 키 — JQL 예시·프로젝트 스코프 안내용. */
  projectKey?: string | null;
  /** 저장/해제 성공 후 보드 재조회. */
  onSaved: () => void;
}

type Method = "jql" | "project";
type Step = "method" | "target" | "done";

/**
 * 마일스톤 JIRA 스코프 위저드.
 *
 * ① 방식 — 보드 프로젝트에서 JQL로 좁히기 / 다른 JIRA 프로젝트 통째로 연결 / 다른 마일스톤 복사
 * ② 대상 — JQL 또는 프로젝트 키·Agile 보드·완료 전환 상태
 * ③ 실행 — 저장(프로젝트 스코프는 서버가 미러 셋업+초기 가져오기까지) 후 결과 확인
 *
 * 연결(계정·웹훅)은 보드가 이미 갖고 있으므로 여기서 재인증은 없다.
 */
export function JiraScopeModal({
  open,
  onClose,
  boardId,
  milestoneId,
  milestoneTitle,
  milestones,
  projectKey,
  onSaved,
}: JiraScopeModalProps) {
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<Method>("jql");

  // 대상 입력값
  const [jql, setJql] = useState("");
  const [scopeProject, setScopeProject] = useState("");
  const [agileBoardId, setAgileBoardId] = useState("");
  const [writeBackStatusId, setWriteBackStatusId] = useState("");

  // 원격 데이터
  const [currentScope, setCurrentScope] = useState<JiraMilestoneScope | null>(
    null,
  );
  const [allScopes, setAllScopes] = useState<JiraMilestoneScope[]>([]);
  const [agileBoards, setAgileBoards] = useState<JiraAgileBoard[] | null>(null);
  const [statuses, setStatuses] = useState<JiraNameRef[] | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<JiraMilestoneScope | null>(
    null,
  );

  // 모달을 열 때마다 스코프 목록을 불러와 현재 값으로 초기화한다.
  useEffect(() => {
    if (!open) return;
    setStep("method");
    setError(null);
    setSavedResult(null);
    setAgileBoards(null);
    setStatuses(null);
    jiraAPI
      .getScopes(boardId)
      .then((scopes) => {
        setAllScopes(scopes);
        const mine = scopes.find((s) => s.milestone_id === milestoneId) ?? null;
        setCurrentScope(mine);
        setJql(mine?.jql ?? "");
        setScopeProject(mine?.project_key ?? "");
        setAgileBoardId(mine?.agile_board_id ?? "");
        setWriteBackStatusId(mine?.write_back_target_status_id ?? "");
        if (mine) {
          setMethod(mine.project_key ? "project" : "jql");
          setStep("target"); // 편집은 대상 단계부터
        } else {
          setMethod("jql");
        }
      })
      .catch(() => {
        setAllScopes([]);
        setCurrentScope(null);
      });
  }, [open, boardId, milestoneId]);

  // 프로젝트 키 확정 시 그 프로젝트의 Agile 보드·상태 목록 로드
  const loadProjectMeta = useCallback(
    async (key: string) => {
      if (!key.trim()) return;
      setIsLoadingProject(true);
      setError(null);
      try {
        const [boards, sts] = await Promise.all([
          jiraAPI.getBoards(boardId, key.trim()),
          jiraAPI.getProjectStatuses(boardId, key.trim()),
        ]);
        setAgileBoards(boards);
        setStatuses(sts);
        if (boards.length > 0 && !boards.some((b) => b.id === agileBoardId)) {
          setAgileBoardId(boards[0].id);
        }
      } catch {
        setAgileBoards([]);
        setStatuses([]);
        setError(
          "프로젝트 정보를 불러오지 못했습니다. 프로젝트 키와 접근 권한을 확인해주세요",
        );
      } finally {
        setIsLoadingProject(false);
      }
    },
    [boardId, agileBoardId],
  );

  // 다른 마일스톤 스코프 복사 — 값을 채우고 대상 단계로
  const copyFrom = (src: JiraMilestoneScope) => {
    setJql(src.jql ?? "");
    setScopeProject(src.project_key ?? "");
    setAgileBoardId(src.agile_board_id ?? "");
    setWriteBackStatusId(src.write_back_target_status_id ?? "");
    setMethod(src.project_key ? "project" : "jql");
    setStep("target");
    if (src.project_key) void loadProjectMeta(src.project_key);
  };

  const canSave =
    method === "jql" ? !!jql.trim() : !!scopeProject.trim();

  const handleSave = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = await jiraAPI.saveScope(boardId, milestoneId, {
        jql: jql.trim() || null,
        projectKey: method === "project" ? scopeProject.trim() : null,
        agileBoardId: method === "project" ? agileBoardId || null : null,
        writeBackTargetStatusId:
          method === "project" ? writeBackStatusId || null : null,
      });
      setSavedResult(result);
      setStep("done");
      onSaved();
    } catch (e: unknown) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "스코프 저장에 실패했습니다. 입력값을 확인해주세요",
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
        e instanceof Error && e.message
          ? e.message
          : "스코프 해제에 실패했습니다",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const copyCandidates = allScopes.filter(
    (s) => s.milestone_id !== milestoneId,
  );
  const milestoneName = (id: string) =>
    milestones.find((m) => m.id === id)?.title ?? id;

  const suggestions = [
    milestoneTitle ? `fixVersion = "${milestoneTitle}"` : null,
    milestoneTitle ? `labels = "${milestoneTitle}"` : null,
  ].filter((s): s is string => !!s);

  const inputCls =
    "w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-labelledby="jira-scope-title"
      className="w-full sm:max-w-lg"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <span className="w-8 h-8 rounded-lg bg-bridge-accent/15 text-bridge-accent grid place-items-center shrink-0">
          <Diamond className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h4
            id="jira-scope-title"
            className="text-sm font-bold text-foreground"
          >
            마일스톤 JIRA 스코프
          </h4>
          <p className="text-xs text-slate-500 truncate">
            {milestoneTitle
              ? `${milestoneTitle}의 JIRA 뷰가 비출 범위를 정합니다`
              : "이 마일스톤의 JIRA 뷰가 비출 범위를 정합니다"}
          </p>
        </div>
        {step === "target" && !currentScope && (
          <button
            type="button"
            onClick={() => setStep("method")}
            className="ml-auto inline-flex items-center gap-1 text-xs text-slate-400 hover:text-foreground transition-colors shrink-0"
          >
            <ChevronLeft className="w-3 h-3" />
            방식
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4">
        {step === "method" && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setMethod("jql");
                setStep("target");
              }}
              className="flex items-start gap-3 text-left p-3.5 rounded-xl bg-foreground/[0.03] border border-foreground/10 hover:border-bridge-accent/50 transition-colors"
            >
              <Filter className="w-4 h-4 text-bridge-secondary mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">
                  {projectKey ?? "보드 프로젝트"}에서 JQL로 좁히기
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  같은 프로젝트를 마일스톤별로 나눠 봅니다 (예: fixVersion)
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod("project");
                setStep("target");
              }}
              className="flex items-start gap-3 text-left p-3.5 rounded-xl bg-foreground/[0.03] border border-foreground/10 hover:border-bridge-accent/50 transition-colors"
            >
              <FolderGit2 className="w-4 h-4 text-bridge-accent mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">
                  다른 JIRA 프로젝트 연결
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  이 마일스톤 전용 미러 컬럼을 만들고 이슈를 가져옵니다
                </span>
              </span>
            </button>
            {copyCandidates.length > 0 && (
              <div className="mt-1">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1">
                  <Copy className="w-3 h-3" />
                  다른 마일스톤에서 복사
                </p>
                <div className="flex flex-col gap-1.5">
                  {copyCandidates.map((s) => (
                    <button
                      key={s.milestone_id}
                      type="button"
                      onClick={() => copyFrom(s)}
                      className="flex items-center gap-2 text-left px-3 py-2 rounded-lg bg-foreground/[0.03] border border-foreground/10 hover:bg-foreground/5 transition-colors"
                    >
                      <span className="text-xs font-bold text-foreground shrink-0">
                        {milestoneName(s.milestone_id)}
                      </span>
                      <span className="text-xs text-slate-500 truncate">
                        {s.project_key ? `◇ ${s.project_key}` : ""}
                        {s.project_key && s.jql ? " · " : ""}
                        {s.jql ?? ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === "target" && method === "jql" && (
          <div>
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
                milestoneTitle
                  ? `예: fixVersion = "${milestoneTitle}"`
                  : '예: fixVersion = "소프트런칭"'
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
            <p className="text-xs text-slate-600 mt-3">
              연결된 {projectKey ?? "보드"} 프로젝트 안에서 좁힙니다. 저장 즉시
              적용되며, JQL 오타는 저장 단계에서 바로 드러납니다.
            </p>
          </div>
        )}

        {step === "target" && method === "project" && (
          <div className="flex flex-col gap-3">
            <div>
              <label
                htmlFor="jira-scope-project"
                className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5"
              >
                JIRA 프로젝트 키
              </label>
              <div className="flex gap-2">
                <input
                  id="jira-scope-project"
                  value={scopeProject}
                  onChange={(e) => setScopeProject(e.target.value)}
                  onBlur={() => void loadProjectMeta(scopeProject)}
                  placeholder="예: QASB"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => void loadProjectMeta(scopeProject)}
                  disabled={!scopeProject.trim() || isLoadingProject}
                  className="shrink-0 px-3 rounded-xl text-xs font-bold bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-all disabled:opacity-50"
                >
                  {isLoadingProject ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "불러오기"
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                연결된 Atlassian 계정으로 접근 가능한 프로젝트여야 합니다
              </p>
            </div>

            {agileBoards && agileBoards.length > 0 && (
              <div>
                <label
                  htmlFor="jira-scope-board"
                  className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5"
                >
                  미러할 Agile 보드
                </label>
                <select
                  id="jira-scope-board"
                  value={agileBoardId}
                  onChange={(e) => setAgileBoardId(e.target.value)}
                  className={inputCls}
                >
                  {agileBoards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label
                htmlFor="jira-scope-project-jql"
                className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5"
              >
                JQL 필터 (선택)
              </label>
              <input
                id="jira-scope-project-jql"
                value={jql}
                onChange={(e) => setJql(e.target.value)}
                placeholder="비워두면 프로젝트 전체를 가져옵니다"
                className={`${inputCls} font-mono`}
              />
            </div>

            {statuses && statuses.length > 0 && (
              <div>
                <label
                  htmlFor="jira-scope-wb"
                  className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5"
                >
                  완료 시 전환할 상태 (선택)
                </label>
                <select
                  id="jira-scope-wb"
                  value={writeBackStatusId}
                  onChange={(e) => setWriteBackStatusId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">사용 안 함 (보드 기본 따름)</option>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-600 mt-1">
                  BRIDGE에서 완료된 카드가 이 상태로 역동기화됩니다 (보드
                  설정에서 완료 역동기화가 켜져 있어야 동작)
                </p>
              </div>
            )}
          </div>
        )}

        {step === "done" && savedResult && (
          <div className="text-center py-4">
            <span className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 grid place-items-center mx-auto mb-3">
              <Check className="w-6 h-6" />
            </span>
            <p className="text-sm font-bold text-foreground mb-1">
              스코프가 적용되었습니다
            </p>
            <p className="text-xs text-slate-500">
              {savedResult.project_key ? `◇ ${savedResult.project_key} · ` : ""}
              {savedResult.claimed_count}건 연결
              {savedResult.mirror_ready ? " · 전용 미러 컬럼 준비됨" : ""}
            </p>
            {savedResult.project_key && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                ⚠ 실시간 반영을 받으려면 {savedResult.project_key} 프로젝트에도
                웹훅(Automation)을 등록하세요. 등록 전까지는 2분 폴링으로
                동기화됩니다.
              </p>
            )}
          </div>
        )}

        {currentScope && step === "target" && (
          <p className="text-xs text-slate-600 mt-3 tabular-nums">
            현재 {currentScope.claimed_count}건 적용 중
            {currentScope.last_claimed_at
              ? ` · 마지막 동기화 ${formatDateTime(currentScope.last_claimed_at)}`
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
          {currentScope && step !== "done" && (
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
        {step === "target" && (
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || isSaving || isDeleting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
          >
            {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
            {isSaving
              ? method === "project"
                ? "미러 셋업·가져오는 중…"
                : "적용 중…"
              : "저장 후 적용"}
          </button>
        )}
        {step === "done" && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all"
          >
            보드 보기
          </button>
        )}
      </div>
    </MotionModal>
  );
}
