import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import {
  jiraAPI,
  JiraStatus,
  JiraTestResult,
  JiraImportResult,
  JiraNameRef,
} from "../utils/api";

interface JiraSettingsPanelProps {
  boardId: string;
  onJiraStatusChange?: (connected: boolean) => void;
}

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
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isSavingWriteBack, setIsSavingWriteBack] = useState(false);

  // results
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<JiraTestResult | null>(null);
  const [importResult, setImportResult] = useState<JiraImportResult | null>(null);
  const [statuses, setStatuses] = useState<JiraNameRef[]>([]);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await jiraAPI.getStatus(boardId).catch(() => null);
      setStatus(data);
      onJiraStatusChange?.(!!data?.connected);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, onJiraStatusChange]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // meta(상태 목록)는 연결된 뒤에만 (역동기화 대상 선택용)
  useEffect(() => {
    if (!status?.connected) return;
    jiraAPI
      .getMeta(boardId)
      .then((m) => setStatuses(m.statuses || []))
      .catch(() => setStatuses([]));
  }, [boardId, status?.connected]);

  const handleConnect = async () => {
    setErrorMessage(null);
    if (!baseUrl.trim() || !projectKey.trim() || !accountEmail.trim() || !apiToken.trim()) {
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
    setIsImporting(true);
    if (!preview) setImportResult(null);
    try {
      const result = await jiraAPI.importIssues(boardId, {
        jql: jql.trim() || undefined,
        preview,
      });
      setImportResult(result);
      if (!preview) fetchStatus();
    } catch (e) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : t("jiraIntegration.importFailed", "가져오기에 실패했습니다"),
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleWriteBackToggle = async (enabled: boolean, targetStatusId?: string) => {
    setIsSavingWriteBack(true);
    setErrorMessage(null);
    try {
      const result = await jiraAPI.updateWriteBack(boardId, {
        enabled,
        targetStatusId: targetStatusId ?? status?.write_back_target_status_id ?? undefined,
      });
      setStatus(result);
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : t("jiraIntegration.saveFailed", "저장에 실패했습니다"),
      );
    } finally {
      setIsSavingWriteBack(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t("jiraIntegration.disconnectConfirm", "JIRA 연동을 해제할까요? 이미 가져온 카드는 남습니다."))) {
      return;
    }
    setIsDisconnecting(true);
    setErrorMessage(null);
    try {
      await jiraAPI.disconnect(boardId);
      setStatus(null);
      setImportResult(null);
      setTestResult(null);
      onJiraStatusChange?.(false);
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : t("jiraIntegration.disconnectFailed", "연동 해제에 실패했습니다"),
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

  // ── State 1: 미연결 — 연결 폼 ──
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
            {t("jiraIntegration.connectDesc", "JIRA 이슈를 이 보드로 가져오고, 완료 시 JIRA로 역동기화합니다.")}
          </p>

          <div>
            <label className={labelCls}>{t("jiraIntegration.site", "JIRA 사이트")}</label>
            <input
              className={inputCls}
              placeholder="your-team.atlassian.net"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>{t("jiraIntegration.projectKey", "프로젝트 키")}</label>
            <input
              className={inputCls}
              placeholder="PROJ"
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>{t("jiraIntegration.accountEmail", "계정 이메일")}</label>
            <input
              className={inputCls}
              placeholder="you@company.com"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>{t("jiraIntegration.apiToken", "API 토큰")}</label>
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
            className="flex items-center justify-center gap-2 w-full px-4 py-2 text-xs font-bold text-white bg-bridge-accent rounded-xl hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50"
          >
            {isConnecting ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
            {t("jiraIntegration.connectButton", "연결")}
          </button>
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
            <div className="text-xs text-slate-500 truncate">{status.base_url}</div>
          </div>
          <button
            onClick={handleTest}
            disabled={isTesting}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-all disabled:opacity-50"
          >
            {isTesting ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
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
            {testResult.success ? <Check size={12} /> : <AlertCircle size={12} />}
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
          <label className={labelCls}>{t("jiraIntegration.importTitle", "가져오기")}</label>
          <input
            className={`${inputCls} mb-2`}
            placeholder={`project = ${status.project_key}`}
            value={jql}
            onChange={(e) => setJql(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleImport(true)}
              disabled={isImporting}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-all disabled:opacity-50"
            >
              {t("jiraIntegration.preview", "미리보기")}
            </button>
            <button
              onClick={() => handleImport(false)}
              disabled={isImporting}
              className="flex items-center gap-1.5 flex-1 justify-center px-3 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
            >
              {isImporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {t("jiraIntegration.import", "가져오기")}
            </button>
          </div>

          {importResult && (
            <div className="mt-2 px-2.5 py-2 rounded-lg bg-bridge-accent/10 text-xs text-foreground space-y-0.5">
              <div className="font-bold text-bridge-accent">
                {t("jiraIntegration.resultTotal", "대상")} {importResult.total}
                {importResult.created > 0 &&
                  ` · ${t("jiraIntegration.resultCreated", "생성")} ${importResult.created}`}
                {importResult.skipped > 0 &&
                  ` · ${t("jiraIntegration.resultSkipped", "스킵")} ${importResult.skipped}`}
              </div>
              <div className="text-slate-400">
                Feature {importResult.features} · Task {importResult.tasks} · Checklist{" "}
                {importResult.checklists} · Comment {importResult.comments}
              </div>
              {importResult.errors?.length > 0 && (
                <div className="text-amber-400">
                  {importResult.errors.length} {t("jiraIntegration.resultErrors", "건 경고")}
                </div>
              )}
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
                {t("jiraIntegration.writeBackDesc", "BRIDGE에서 완료하면 JIRA도 전환")}
              </div>
            </div>
            <button
              onClick={() => handleWriteBackToggle(!status.write_back_enabled)}
              disabled={isSavingWriteBack || (!status.write_back_enabled && !status.write_back_target_status_id)}
              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                status.write_back_enabled ? "bg-bridge-accent" : "bg-foreground/15"
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
            onChange={(e) => handleWriteBackToggle(status.write_back_enabled, e.target.value)}
            disabled={isSavingWriteBack}
          >
            <option value="">{t("jiraIntegration.selectTargetStatus", "완료 대상 상태 선택")}</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* 해제 */}
        <div className="border-t border-foreground/[0.08] pt-3 flex justify-end">
          <button
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            {isDisconnecting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            {t("jiraIntegration.disconnect", "연동 해제")}
          </button>
        </div>
      </div>
    </div>
  );
}
