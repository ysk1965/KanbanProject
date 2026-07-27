import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  Check,
  AlertCircle,
  Plug,
  Download,
  Trash2,
  RefreshCw,
  ExternalLink,
  Eye,
  Layers,
  CheckSquare,
  User,
  UserX,
  Paperclip,
  CornerDownRight,
  Flag,
  Building2,
} from "lucide-react";
import {
  jiraAPI,
  BACKEND_ORIGIN,
  JiraStatus,
  JiraTestResult,
  JiraImportResult,
  JiraNameRef,
  JiraBlockRef,
  JiraSiteRef,
  JiraAgileBoard,
} from "../utils/api";

interface JiraSettingsPanelProps {
  boardId: string;
  onJiraStatusChange?: (connected: boolean) => void;
}

/** JIRA statusCategory → 색 점 hex (할 일=회청 / 진행 중=파랑 / 완료=초록). */
const CATEGORY_HEX: Record<string, string> = {
  new: "#64748b",
  indeterminate: "#3b82f6",
  done: "#22c55e",
};
const categoryHex = (cat?: string | null): string =>
  (cat && CATEGORY_HEX[cat]) || "#94a3b8";

export function JiraSettingsPanel({
  boardId,
  onJiraStatusChange,
}: JiraSettingsPanelProps) {
  const { t } = useTranslation();

  const [status, setStatus] = useState<JiraStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // connect form
  const [baseUrl, setBaseUrl] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [jql, setJql] = useState("");

  // action flags
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isSavingWriteBack, setIsSavingWriteBack] = useState(false);

  // results
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<JiraTestResult | null>(null);
  const [importResult, setImportResult] = useState<JiraImportResult | null>(
    null,
  );
  const [previewResult, setPreviewResult] = useState<JiraImportResult | null>(
    null,
  );
  const [statuses, setStatuses] = useState<JiraNameRef[]>([]);

  // 미러 컬럼 (JIRA 상태 ↔ BRIDGE 미러 블록)
  const [mirrorBlocks, setMirrorBlocks] = useState<JiraBlockRef[]>([]);
  const [isSettingUpMirror, setIsSettingUpMirror] = useState(false);
  // 미러 대상 JIRA Agile 보드 선택 (프로젝트에 보드 여러 개일 때)
  const [agileBoards, setAgileBoards] = useState<JiraAgileBoard[]>([]);
  const [isSavingBoard, setIsSavingBoard] = useState(false);
  // 마지막 재동기화의 컬럼 출처 (BOARD_CONFIG / STATUS_FALLBACK + 상세)
  const [mirrorSource, setMirrorSource] = useState<{
    source: string | null;
    detail: string | null;
  } | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);

  // OAuth
  const [sites, setSites] = useState<JiraSiteRef[]>([]);
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [selectedCloudId, setSelectedCloudId] = useState("");
  const [siteProjectKey, setSiteProjectKey] = useState("");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [showTokenForm, setShowTokenForm] = useState(false);

  // 콜백은 ref로만 참조 — 호출부가 인라인 함수를 넘겨도 fetchStatus 아이덴티티가
  // 흔들리지 않게 한다. (부모 리렌더 → 새 콜백 → 재조회 → 부모 setState 무한루프 방지)
  const onJiraStatusChangeRef = useRef(onJiraStatusChange);
  useEffect(() => {
    onJiraStatusChangeRef.current = onJiraStatusChange;
  }, [onJiraStatusChange]);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await jiraAPI.getStatus(boardId).catch(() => null);
      setStatus(data);
      onJiraStatusChangeRef.current?.(!!data?.connected);
    } finally {
      setIsLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // meta(상태 목록 + 미러 컬럼)는 연결된 뒤에만
  useEffect(() => {
    if (!status?.connected) return;
    jiraAPI
      .getMeta(boardId)
      .then((m) => {
        setStatuses(m.statuses || []);
        setMirrorBlocks((m.blocks || []).filter((b) => !!b.jira_status_id));
      })
      .catch(() => {
        setStatuses([]);
        setMirrorBlocks([]);
      });
  }, [boardId, status?.connected, status?.mirror_ready]);

  // 미러 대상 Agile 보드 목록 (연결된 뒤에만)
  useEffect(() => {
    if (!status?.connected) return;
    jiraAPI
      .getBoards(boardId)
      .then((b) => setAgileBoards(b || []))
      .catch(() => setAgileBoards([]));
  }, [boardId, status?.connected]);

  // OAuth 콜백 결과 처리 (?jira=oauth_success|oauth_error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jiraParam = params.get("jira");
    if (jiraParam !== "oauth_success" && jiraParam !== "oauth_error") return;
    if (jiraParam === "oauth_success") {
      fetchStatus();
    } else {
      setErrorMessage(
        t("jiraIntegration.oauthError", "Atlassian 연결에 실패했습니다"),
      );
    }
    params.delete("jira");
    params.delete("board");
    params.delete("reason");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${qs ? "?" + qs : ""}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 사이트 선택 단계면 접근 가능한 사이트 로드
  useEffect(() => {
    if (!status?.needs_site_selection) return;
    setIsLoadingSites(true);
    jiraAPI
      .getSites(boardId)
      .then((s) => {
        setSites(s);
        if (s.length === 1) setSelectedCloudId(s[0].cloud_id);
      })
      .catch(() => setSites([]))
      .finally(() => setIsLoadingSites(false));
  }, [boardId, status?.needs_site_selection]);

  const handleConnect = async () => {
    setErrorMessage(null);
    if (
      !baseUrl.trim() ||
      !projectKey.trim() ||
      !accountEmail.trim() ||
      !apiToken.trim()
    ) {
      setErrorMessage(t("jiraIntegration.fillAll", "모든 필드를 입력해주세요"));
      return;
    }
    setIsConnecting(true);
    try {
      const result = await jiraAPI.connect(boardId, {
        baseUrl: baseUrl.trim(),
        projectKey: projectKey.trim(),
        accountEmail: accountEmail.trim(),
        apiToken: apiToken.trim(),
        jql: jql.trim() || undefined,
      });
      setStatus(result);
      setApiToken("");
      onJiraStatusChange?.(true);
    } catch (e) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : t("jiraIntegration.connectFailed", "JIRA 연결에 실패했습니다"),
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleOAuthConnect = async () => {
    setErrorMessage(null);
    setIsConnecting(true);
    try {
      const { oauth_url } = await jiraAPI.getOAuthUrl(boardId);
      window.location.href = oauth_url;
    } catch (e) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : t("jiraIntegration.connectFailed", "JIRA 연결에 실패했습니다"),
      );
      setIsConnecting(false);
    }
  };

  const handleFinalize = async () => {
    setErrorMessage(null);
    if (!selectedCloudId || !siteProjectKey.trim()) {
      setErrorMessage(
        t(
          "jiraIntegration.selectSiteProject",
          "사이트와 프로젝트 키를 선택해주세요",
        ),
      );
      return;
    }
    const site = sites.find((s) => s.cloud_id === selectedCloudId);
    setIsFinalizing(true);
    try {
      const result = await jiraAPI.finalize(boardId, {
        cloudId: selectedCloudId,
        baseUrl: site?.url || "",
        projectKey: siteProjectKey.trim(),
      });
      setStatus(result);
      onJiraStatusChange?.(true);
    } catch (e) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : t("jiraIntegration.connectFailed", "JIRA 연결에 실패했습니다"),
      );
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await jiraAPI.test(boardId);
      setTestResult(result);
    } catch {
      setTestResult({
        success: false,
        message: t("jiraIntegration.testFailed", "연결 테스트에 실패했습니다"),
        project_name: null,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleImport = async (preview: boolean) => {
    setErrorMessage(null);
    if (preview) setIsPreviewing(true);
    else {
      setIsImporting(true);
      setImportResult(null);
    }
    try {
      const result = await jiraAPI.importIssues(boardId, {
        jql: jql.trim() || undefined,
        preview,
      });
      if (preview) {
        setPreviewResult(result);
      } else {
        setImportResult(result);
        setPreviewResult(null);
        fetchStatus();
      }
    } catch (e) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : t("jiraIntegration.importFailed", "가져오기에 실패했습니다"),
      );
    } finally {
      if (preview) setIsPreviewing(false);
      else setIsImporting(false);
    }
  };

  const handleWriteBackToggle = async (
    enabled: boolean,
    targetStatusId?: string,
  ) => {
    setIsSavingWriteBack(true);
    setErrorMessage(null);
    try {
      const result = await jiraAPI.updateWriteBack(boardId, {
        enabled,
        targetStatusId:
          targetStatusId ?? status?.write_back_target_status_id ?? undefined,
      });
      setStatus(result);
    } catch (e) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : t("jiraIntegration.saveFailed", "저장에 실패했습니다"),
      );
    } finally {
      setIsSavingWriteBack(false);
    }
  };

  // ── 미러 셋업 / 재동기화 ──
  const handleSetupMirror = async () => {
    setIsSettingUpMirror(true);
    setErrorMessage(null);
    try {
      const result = await jiraAPI.setupMirror(boardId);
      setStatus(result.status);
      setMirrorSource({
        source: result.column_source,
        detail: result.column_source_detail,
      });
      onJiraStatusChange?.(!!result.status?.connected);
      // 미러 컬럼 갱신
      const m = await jiraAPI.getMeta(boardId).catch(() => null);
      if (m)
        setMirrorBlocks((m.blocks || []).filter((b) => !!b.jira_status_id));
    } catch (e) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : t("jiraIntegration.saveFailed", "저장에 실패했습니다"),
      );
    } finally {
      setIsSettingUpMirror(false);
    }
  };

  // ── 미러 대상 보드 선택 → 저장 후 즉시 재동기화 ──
  const handleSelectBoard = async (agileBoardId: string) => {
    setIsSavingBoard(true);
    setErrorMessage(null);
    try {
      const s = await jiraAPI.selectAgileBoard(boardId, agileBoardId);
      setStatus(s);
      setAgileBoards((prev) =>
        prev.map((b) => ({ ...b, selected: b.id === agileBoardId })),
      );
      // 선택 즉시 그 보드의 컬럼으로 재동기화
      await handleSetupMirror();
    } catch (e) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : t("jiraIntegration.saveFailed", "저장에 실패했습니다"),
      );
    } finally {
      setIsSavingBoard(false);
    }
  };

  const handleDisconnect = async () => {
    if (
      !window.confirm(
        t(
          "jiraIntegration.disconnectConfirm",
          "JIRA 연동을 해제할까요? 이미 가져온 카드는 남습니다.",
        ),
      )
    ) {
      return;
    }
    setIsDisconnecting(true);
    setErrorMessage(null);
    try {
      await jiraAPI.disconnect(boardId);
      setStatus(null);
      setImportResult(null);
      setPreviewResult(null);
      setTestResult(null);
      onJiraStatusChange?.(false);
    } catch (e) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : t("jiraIntegration.disconnectFailed", "연동 해제에 실패했습니다"),
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoading) return null;

  const errorBanner = errorMessage && (
    <button
      onClick={() => setErrorMessage(null)}
      className="flex items-center gap-1.5 w-full mb-2 px-2.5 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400 text-left"
    >
      <AlertCircle size={12} />
      <span className="flex-1">{errorMessage}</span>
    </button>
  );

  const inputCls =
    "w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";
  const labelCls =
    "text-xs text-slate-400 uppercase tracking-wider font-medium mb-1.5 block";

  // ── State 1a: OAuth 사이트/프로젝트 선택 ──
  if ((!status || !status.connected) && status?.needs_site_selection) {
    return (
      <div>
        {errorBanner}
        <div className="p-3 bg-white/[0.03] rounded-xl border border-foreground/10 space-y-3">
          <div className="flex items-center gap-2 text-xs text-foreground font-bold">
            <Building2 size={13} className="text-bridge-accent" />
            {t("jiraIntegration.selectSite", "사이트 선택")}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {t(
              "jiraIntegration.selectSiteDesc",
              "가져올 JIRA 사이트와 프로젝트를 선택하세요.",
            )}
          </p>
          {isLoadingSites ? (
            <div className="flex justify-center py-3">
              <Loader2 size={16} className="animate-spin text-bridge-accent" />
            </div>
          ) : (
            <>
              <div>
                <label className={labelCls}>
                  {t("jiraIntegration.site", "JIRA 사이트")}
                </label>
                <select
                  className={inputCls}
                  value={selectedCloudId}
                  onChange={(e) => setSelectedCloudId(e.target.value)}
                >
                  <option value="">
                    {t("jiraIntegration.selectSitePlaceholder", "사이트 선택…")}
                  </option>
                  {sites.map((s) => (
                    <option key={s.cloud_id} value={s.cloud_id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>
                  {t("jiraIntegration.projectKey", "프로젝트 키")}
                </label>
                <input
                  className={inputCls}
                  placeholder="PROJ"
                  value={siteProjectKey}
                  onChange={(e) => setSiteProjectKey(e.target.value)}
                />
              </div>
              <button
                onClick={handleFinalize}
                disabled={isFinalizing}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 text-xs font-bold text-white bg-bridge-accent rounded-xl hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
              >
                {isFinalizing ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Check size={13} />
                )}
                {t("jiraIntegration.finish", "완료")}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="w-full text-xs text-slate-500 hover:text-slate-400 transition-colors"
              >
                {t("jiraIntegration.cancel", "취소")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── State 1: 미연결 — OAuth 버튼(주) + API 토큰 폼(보조) ──
  if (!status || !status.connected) {
    return (
      <div>
        {errorBanner}
        <div className="p-3 bg-white/[0.03] rounded-xl border border-foreground/10 space-y-3">
          <div className="flex items-center gap-2 text-xs text-foreground font-bold">
            <Plug size={13} className="text-bridge-accent" />
            {t("jiraIntegration.connectTitle", "JIRA 연결")}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {t(
              "jiraIntegration.connectDesc",
              "JIRA 이슈를 이 보드로 가져오고, 완료 시 JIRA로 역동기화합니다.",
            )}
          </p>

          <button
            onClick={handleOAuthConnect}
            disabled={isConnecting}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-[#2684ff] to-[#0052cc] rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
          >
            {isConnecting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Building2 size={13} />
            )}
            {t("jiraIntegration.connectWithAtlassian", "Atlassian으로 연결")}
          </button>

          <button
            onClick={() => setShowTokenForm((v) => !v)}
            className="w-full text-xs text-slate-500 hover:text-slate-400 transition-colors"
          >
            {t("jiraIntegration.useApiToken", "또는 API 토큰으로 연결")}
          </button>

          {showTokenForm && (
            <div className="space-y-3 border-t border-foreground/[0.08] pt-3">
              <div>
                <label className={labelCls}>
                  {t("jiraIntegration.site", "JIRA 사이트")}
                </label>
                <input
                  className={inputCls}
                  placeholder="your-team.atlassian.net"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>
                  {t("jiraIntegration.projectKey", "프로젝트 키")}
                </label>
                <input
                  className={inputCls}
                  placeholder="PROJ"
                  value={projectKey}
                  onChange={(e) => setProjectKey(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>
                  {t("jiraIntegration.accountEmail", "계정 이메일")}
                </label>
                <input
                  className={inputCls}
                  placeholder="you@company.com"
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>
                  {t("jiraIntegration.apiToken", "API 토큰")}
                </label>
                <input
                  type="password"
                  className={inputCls}
                  placeholder="••••••••••••"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                />
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 mt-1.5 text-xs text-bridge-accent hover:underline"
                >
                  <ExternalLink size={11} />
                  {t("jiraIntegration.tokenHelp", "API 토큰 발급하기")}
                </a>
              </div>
              <div>
                <label className={labelCls}>
                  {t("jiraIntegration.jqlOptional", "JQL 범위 (선택)")}
                </label>
                <input
                  className={inputCls}
                  placeholder="project = PROJ AND sprint in openSprints()"
                  value={jql}
                  onChange={(e) => setJql(e.target.value)}
                />
              </div>
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 text-xs font-bold text-white bg-bridge-accent rounded-xl hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
              >
                {isConnecting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Plug size={13} />
                )}
                {t("jiraIntegration.connectButton", "연결")}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── State 2: 연결됨 — 상태 + 가져오기 + 역동기화 ──
  return (
    <div>
      {errorBanner}
      <div className="p-3 bg-white/[0.03] rounded-xl border border-foreground/10 space-y-3">
        {/* 헤더 */}
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-foreground font-bold truncate">
              JIRA · {status.project_key}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {status.base_url}
            </div>
          </div>
          <button
            onClick={handleTest}
            disabled={isTesting}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-all disabled:opacity-50"
          >
            {isTesting ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <RefreshCw size={11} />
            )}
            {t("jiraIntegration.test", "테스트")}
          </button>
        </div>

        {testResult && (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${
              testResult.success
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
            }`}
          >
            {testResult.success ? (
              <Check size={12} />
            ) : (
              <AlertCircle size={12} />
            )}
            <span>{testResult.message}</span>
          </div>
        )}

        {status.last_synced_at && (
          <div className="text-xs text-slate-500">
            {t("jiraIntegration.lastSynced", "마지막 동기화")}:{" "}
            {new Date(status.last_synced_at).toLocaleString()}
          </div>
        )}

        {/* 가져오기 */}
        <div className="border-t border-foreground/[0.08] pt-3">
          <label className={labelCls}>
            {t("jiraIntegration.importTitle", "가져오기")}
          </label>
          <input
            className={`${inputCls} mb-2`}
            placeholder={`project = ${status.project_key}`}
            value={jql}
            onChange={(e) => setJql(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleImport(true)}
              disabled={isImporting || isPreviewing}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-all disabled:opacity-50"
            >
              {isPreviewing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Eye size={12} />
              )}
              {t("jiraIntegration.preview", "미리보기")}
            </button>
            <button
              onClick={() => handleImport(false)}
              disabled={isImporting || isPreviewing}
              className="flex items-center gap-1.5 flex-1 justify-center px-3 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
            >
              {isImporting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              {t("jiraIntegration.import", "가져오기")}
            </button>
          </div>

          {/* 미리보기: 이슈별 상세 (무엇이 어떻게 들어오는지) */}
          {previewResult && (
            <div className="mt-2 rounded-lg border border-foreground/10 overflow-hidden">
              {/* 요약 헤더 */}
              <div className="px-2.5 py-2 bg-foreground/[0.04] border-b border-foreground/[0.08] space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Eye size={12} className="text-bridge-accent" />
                  {t("jiraIntegration.previewSummary", "미리보기")} ·{" "}
                  {previewResult.total}
                  {t("jiraIntegration.issuesUnit", "건")}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                    <Layers size={10} /> Feature {previewResult.features}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
                    <CheckSquare size={10} /> Task {previewResult.tasks}
                  </span>
                  {previewResult.checklists > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full bg-foreground/10 text-slate-400">
                      <User size={10} /> {previewResult.checklists}
                    </span>
                  )}
                  {previewResult.comments > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full bg-foreground/10 text-slate-400">
                      <Paperclip size={10} /> {previewResult.comments}
                    </span>
                  )}
                  {previewResult.updated > 0 && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-500">
                      {t("jiraIntegration.resultUpdated", "업데이트")}{" "}
                      {previewResult.updated}
                    </span>
                  )}
                  {previewResult.skipped > 0 && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500">
                      {t("jiraIntegration.resultSkipped", "스킵")}{" "}
                      {previewResult.skipped}
                    </span>
                  )}
                </div>
                {previewResult.milestone_name && (
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Flag size={10} className="text-bridge-accent" />
                    {t(
                      "jiraIntegration.milestoneAssign",
                      "현재 마일스톤",
                    )}: {previewResult.milestone_name}
                  </div>
                )}
              </div>

              {/* 이슈 목록 */}
              {previewResult.items && previewResult.items.length > 0 ? (
                <div className="max-h-64 overflow-y-auto custom-scrollbar divide-y divide-foreground/[0.06]">
                  {previewResult.items.map((item) => {
                    const isFeature = item.target_type === "FEATURE";
                    return (
                      <div
                        key={item.key}
                        className={`px-2.5 py-1.5 ${item.skipped ? "opacity-45" : ""}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs px-1 py-0.5 rounded bg-foreground/10 text-slate-400 shrink-0">
                            {item.key}
                          </span>
                          {isFeature ? (
                            <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent shrink-0">
                              <Layers size={10} /> Feature
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary shrink-0">
                              <CheckSquare size={10} />
                              {item.block_name || "Task"}
                            </span>
                          )}
                          {item.will_update && (
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-500 shrink-0 ml-auto">
                              {t("jiraIntegration.willUpdate", "업데이트")}
                            </span>
                          )}
                          {item.skipped && (
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 shrink-0 ml-auto">
                              {item.skip_reason ||
                                t("jiraIntegration.resultSkipped", "스킵")}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-foreground mt-1 line-clamp-2">
                          {item.summary ||
                            t("jiraIntegration.noSummary", "(제목 없음)")}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-slate-500">
                          {item.parent_key && (
                            <span className="inline-flex items-center gap-0.5">
                              <CornerDownRight size={10} /> {item.parent_key}
                            </span>
                          )}
                          {item.assignee_name && (
                            <span
                              className={`inline-flex items-center gap-0.5 ${
                                item.assignee_matched
                                  ? "text-emerald-500"
                                  : "text-slate-500"
                              }`}
                              title={
                                item.assignee_matched
                                  ? t(
                                      "jiraIntegration.assigneeMatched",
                                      "BRIDGE 멤버 매칭됨",
                                    )
                                  : t(
                                      "jiraIntegration.assigneeUnmatched",
                                      "매칭 안 됨 (미배정으로 가져옴)",
                                    )
                              }
                            >
                              {item.assignee_matched ? (
                                <User size={10} />
                              ) : (
                                <UserX size={10} />
                              )}
                              {item.assignee_name}
                            </span>
                          )}
                          {item.attachment_count > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                              <Paperclip size={10} /> {item.attachment_count}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-2.5 py-3 text-xs text-slate-500 text-center">
                  {t("jiraIntegration.previewEmpty", "가져올 이슈가 없습니다")}
                </div>
              )}
            </div>
          )}

          {/* 실제 가져오기 결과 요약 */}
          {importResult && (
            <div className="mt-2 px-2.5 py-2 rounded-lg bg-bridge-accent/10 text-xs text-foreground space-y-0.5">
              <div className="font-bold text-bridge-accent">
                {t("jiraIntegration.resultTotal", "대상")} {importResult.total}
                {importResult.created > 0 &&
                  ` · ${t("jiraIntegration.resultCreated", "생성")} ${importResult.created}`}
                {importResult.updated > 0 &&
                  ` · ${t("jiraIntegration.resultUpdated", "업데이트")} ${importResult.updated}`}
                {importResult.skipped > 0 &&
                  ` · ${t("jiraIntegration.resultSkipped", "스킵")} ${importResult.skipped}`}
              </div>
              <div className="text-slate-400">
                Feature {importResult.features} · Task {importResult.tasks} ·
                Checklist {importResult.checklists} · Comment{" "}
                {importResult.comments}
              </div>
              {importResult.errors?.length > 0 && (
                <div className="text-amber-400">
                  {importResult.errors.length}{" "}
                  {t("jiraIntegration.resultErrors", "건 경고")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 미러 컬럼 — JIRA 상태를 블록에 1:1 자동 미러링 (설정 불필요) */}
        <div className="border-t border-foreground/[0.08] pt-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-foreground font-medium">
              {t("jiraIntegration.mirrorTitle", "컬럼 ↔ JIRA 상태")}
            </div>
            <button
              onClick={handleSetupMirror}
              disabled={isSettingUpMirror}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors disabled:opacity-50"
            >
              {isSettingUpMirror ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <RefreshCw size={11} />
              )}
              {status.mirror_ready
                ? t("jiraIntegration.mirrorResync", "재동기화")
                : t("jiraIntegration.mirrorSetup", "미러 시작")}
            </button>
          </div>
          <div className="text-xs text-slate-500 mb-2.5 leading-relaxed">
            {t(
              "jiraIntegration.mirrorDesc",
              "컬럼이 JIRA 상태와 자동으로 맞춰집니다. 카드를 옮기면 JIRA 상태도 같이 바뀌고, JIRA에서 바뀌면 여기도 반영됩니다. 미러 컬럼은 JIRA 뷰 탭에만 표시돼요.",
            )}
          </div>

          {/* 재동기화 컬럼 출처 — 폴백이면 이유를 노출해 원인 진단 */}
          {mirrorSource &&
            (mirrorSource.source === "STATUS_FALLBACK" ? (
              <div className="mb-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <div className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-0.5">
                  {t(
                    "jiraIntegration.mirrorFallbackTitle",
                    "JIRA 보드 구성을 못 읽어 상태 목록으로 대체됨",
                  )}
                </div>
                <div className="text-xs text-slate-500 leading-relaxed break-words">
                  {mirrorSource.detail}
                </div>
              </div>
            ) : mirrorSource.source === "BOARD_CONFIG" ? (
              <div className="mb-2.5 flex items-center gap-1.5 text-xs text-bridge-secondary">
                <Check size={12} />
                <span className="truncate">{mirrorSource.detail}</span>
              </div>
            ) : null)}

          {/* 미러 대상 JIRA 보드 선택 — 프로젝트에 보드가 여러 개일 때 어느 보드의 컬럼을 미러링할지 */}
          {agileBoards.length > 1 && (
            <div className="mb-2.5">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {t("jiraIntegration.mirrorBoardLabel", "미러 대상 JIRA 보드")}
              </label>
              <select
                value={status.agile_board_id || ""}
                onChange={(e) => handleSelectBoard(e.target.value)}
                disabled={isSavingBoard || isSettingUpMirror}
                className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg py-2 px-3 text-xs text-foreground outline-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all disabled:opacity-50"
              >
                <option value="">
                  {t("jiraIntegration.mirrorBoardAuto", "자동 선택 (첫 칸반 보드)")}
                </option>
                {agileBoards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.type ? ` (${b.type})` : ""}
                  </option>
                ))}
              </select>
              <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                {t(
                  "jiraIntegration.mirrorBoardHint",
                  "보드를 고르면 그 보드의 컬럼 구성으로 자동 재동기화됩니다.",
                )}
              </div>
            </div>
          )}

          {status.mirror_ready && mirrorBlocks.length > 0 ? (
            <div className="rounded-lg border border-foreground/10 overflow-hidden">
              {mirrorBlocks.map((block) => {
                const primary = statuses.find(
                  (s) => s.id === block.jira_status_id,
                );
                // 이 미러 컬럼에 묶인 JIRA 상태 전체를 이름으로 표시 (없으면 대표 상태).
                const boundIds =
                  block.jira_status_ids && block.jira_status_ids.length > 0
                    ? block.jira_status_ids
                    : block.jira_status_id
                      ? [block.jira_status_id]
                      : [];
                const boundNames =
                  boundIds
                    .map((id) => statuses.find((s) => s.id === id)?.name || id)
                    .join(" · ") || block.jira_status_id;
                return (
                  <div
                    key={block.id}
                    className="grid grid-cols-[auto_1fr_auto_1.4fr] items-center gap-2 px-3 py-2 border-t border-foreground/[0.06] first:border-t-0"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-none"
                      style={{ background: categoryHex(primary?.category) }}
                      title={primary?.category || ""}
                    />
                    <span className="text-xs font-bold text-foreground truncate">
                      {block.name}
                    </span>
                    <span className="text-bridge-secondary text-xs font-bold">
                      ↔
                    </span>
                    <span className="text-xs text-slate-500 truncate text-right">
                      {boundNames}
                    </span>
                  </div>
                );
              })}
              <div className="px-3 py-2 text-xs text-slate-500 bg-foreground/[0.03] border-t border-foreground/[0.06] flex items-center gap-1.5">
                🔒{" "}
                {t(
                  "jiraIntegration.mirrorLocked",
                  "JIRA 상태를 그대로 미러링 — 고를 게 없습니다.",
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-foreground/15 px-3 py-4 text-center">
              <div className="text-xs text-slate-500 leading-relaxed">
                {t(
                  "jiraIntegration.mirrorNotReady",
                  "아직 미러 컬럼이 없습니다. '미러 시작'을 누르면 JIRA 상태별 컬럼을 자동 생성합니다.",
                )}
              </div>
            </div>
          )}
        </div>

        {/* 완료 역동기화 */}
        <div className="border-t border-foreground/[0.08] pt-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-2">
              <div className="text-xs text-foreground font-medium">
                {t("jiraIntegration.writeBackTitle", "완료 역동기화")}
              </div>
              <div className="text-xs text-slate-500">
                {t(
                  "jiraIntegration.writeBackDesc",
                  "BRIDGE에서 완료하면 JIRA도 전환",
                )}
              </div>
            </div>
            <button
              onClick={() => handleWriteBackToggle(!status.write_back_enabled)}
              disabled={
                isSavingWriteBack ||
                (!status.write_back_enabled &&
                  !status.write_back_target_status_id)
              }
              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                status.write_back_enabled
                  ? "bg-bridge-accent"
                  : "bg-foreground/15"
              } disabled:opacity-50`}
              aria-label={t("jiraIntegration.writeBackTitle", "완료 역동기화")}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                  status.write_back_enabled ? "right-0.5" : "left-0.5"
                }`}
              />
            </button>
          </div>
          <select
            className={`${inputCls} mt-2`}
            value={status.write_back_target_status_id || ""}
            onChange={(e) =>
              handleWriteBackToggle(status.write_back_enabled, e.target.value)
            }
            disabled={isSavingWriteBack}
          >
            <option value="">
              {t("jiraIntegration.selectTargetStatus", "완료 대상 상태 선택")}
            </option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* 웹훅 (근실시간 pull) */}
        {status.webhook_token && (
          <div className="border-t border-foreground/[0.08] pt-3">
            <div className="text-xs text-foreground font-medium mb-1">
              {t("jiraIntegration.webhookTitle", "웹훅 (근실시간 동기화)")}
            </div>
            <div className="text-xs text-slate-500 mb-2 leading-relaxed">
              {t(
                "jiraIntegration.webhookDesc",
                "JIRA Automation/웹훅에서 이 URL로 POST하면 검토중·완료·반려가 즉시 반영됩니다. (미설정 시 5분 폴링으로 백업)",
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                readOnly
                value={`${BACKEND_ORIGIN}/api/v1/jira/webhook/${boardId}?token=${status.webhook_token}`}
                onFocus={(e) => e.currentTarget.select()}
                className={`${inputCls} flex-1 font-mono text-slate-400`}
              />
              <button
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(
                      `${BACKEND_ORIGIN}/api/v1/jira/webhook/${boardId}?token=${status.webhook_token}`,
                    )
                    .then(() => {
                      setWebhookCopied(true);
                      window.setTimeout(() => setWebhookCopied(false), 1500);
                    });
                }}
                className="px-2.5 py-2 rounded-lg text-xs font-bold text-foreground bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 transition-colors shrink-0"
              >
                {webhookCopied
                  ? t("jiraIntegration.copied", "✓ 복사됨")
                  : t("jiraIntegration.copy", "복사")}
              </button>
            </div>
          </div>
        )}

        {/* 해제 */}
        <div className="border-t border-foreground/[0.08] pt-3 flex justify-end">
          <button
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            {isDisconnecting ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Trash2 size={11} />
            )}
            {t("jiraIntegration.disconnect", "연동 해제")}
          </button>
        </div>
      </div>
    </div>
  );
}
