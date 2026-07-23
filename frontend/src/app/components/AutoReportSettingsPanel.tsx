import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ExternalLink,
  FileText,
  Github,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Trello,
} from "lucide-react";

import {
  autoReportAPI,
  confluenceAPI,
  githubAPI,
  type ConfluenceSiteRef,
  type ConfluenceSpaceRef,
  type AutoReport,
  type ConfluenceStatus,
  type GithubAvailableRepo,
  type GithubStatus,
  type ReportConfig,
  type ReportPreview,
} from "../utils/api";

interface AutoReportSettingsPanelProps {
  boardId: string;
  /** 관리자만 연결·설정을 바꿀 수 있다 */
  canManage: boolean;
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/** 연결 카드가 공유하는 상태 어휘 — 백엔드 IntegrationConnectionStatus와 같다 */
type CardState = "not_connected" | "target_not_selected" | "connected" | "error";

function StatusPill({ state }: { state: CardState }) {
  const map: Record<CardState, { label: string; className: string }> = {
    not_connected: {
      label: "연결 안 됨",
      className: "bg-foreground/10 text-slate-400",
    },
    target_not_selected: {
      label: "대상 미선택",
      className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    },
    connected: {
      label: "연결됨",
      className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
    error: {
      label: "연결 끊김",
      className: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    },
  };
  const { label, className } = map[state];
  return (
    <span
      className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${className}`}
    >
      {label}
    </span>
  );
}

function SourceCard({
  icon,
  title,
  state,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  state: CardState;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
      <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06] border-b border-foreground/[0.06] flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <span className="text-xs md:text-sm font-bold text-foreground flex-1">
          {title}
        </span>
        <StatusPill state={state} />
      </div>
      <div className="bg-bridge-dark p-3 md:p-5 flex flex-col gap-3">
        <p className="text-xs text-slate-500">{description}</p>
        {children}
      </div>
    </div>
  );
}

export function AutoReportSettingsPanel({
  boardId,
  canManage,
}: AutoReportSettingsPanelProps) {
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [github, setGithub] = useState<GithubStatus | null>(null);
  const [confluence, setConfluence] = useState<ConfluenceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [repos, setRepos] = useState<GithubAvailableRepo[] | null>(null);
  const [sites, setSites] = useState<ConfluenceSiteRef[] | null>(null);
  const [spaces, setSpaces] = useState<ConfluenceSpaceRef[] | null>(null);
  const [spaceKey, setSpaceKey] = useState("");
  const [label, setLabel] = useState("weekly-report");

  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<AutoReport[] | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await autoReportAPI.list(boardId, 20));
    } catch {
      setHistory([]);
    }
  }, [boardId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 연동이 하나 실패해도 나머지 카드는 그려야 한다.
      const [configRes, githubRes, confluenceRes] = await Promise.allSettled([
        autoReportAPI.getConfig(boardId),
        githubAPI.getStatus(boardId),
        confluenceAPI.getStatus(boardId),
      ]);
      if (configRes.status === "fulfilled") setConfig(configRes.value);
      if (githubRes.status === "fulfilled") setGithub(githubRes.value);
      if (confluenceRes.status === "fulfilled")
        setConfluence(confluenceRes.value);
      if (configRes.status === "rejected") {
        setError("발송 설정을 불러오지 못했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * GitHub App 설치를 마치면 Setup URL로 `?installation_id=...&state=<boardId>`가 붙어 돌아온다.
   * 그 값을 보드에 붙이고 주소는 지운다 — 새로고침할 때마다 다시 붙이려 하면 안 되기 때문이다.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get("installation_id");
    if (!installationId || !canManage) return;
    if (params.get("state") && params.get("state") !== boardId) return;

    void (async () => {
      try {
        setGithub(await githubAPI.linkInstallation(boardId, installationId));
        setNotice("GitHub 설치를 연결했습니다. 저장소를 선택해주세요.");
      } catch (e) {
        setError(
          (e as { message?: string })?.message ??
            "GitHub 설치를 연결하지 못했습니다.",
        );
      } finally {
        params.delete("installation_id");
        params.delete("setup_action");
        params.delete("state");
        const query = params.toString();
        window.history.replaceState(
          {},
          "",
          window.location.pathname + (query ? `?${query}` : ""),
        );
      }
    })();
  }, [boardId, canManage]);

  const patchConfig = async (patch: Partial<ReportConfig>) => {
    if (!config || !canManage) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await autoReportAPI.updateConfig(boardId, patch);
      setConfig(updated);
    } catch (e) {
      setError(
        (e as { message?: string })?.message ?? "설정을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const githubState: CardState = !github?.connected
    ? "not_connected"
    : github.status === "DISCONNECTED"
      ? "error"
      : github.selected_repos.length === 0
        ? "target_not_selected"
        : "connected";

  const confluenceState: CardState = !confluence?.connected
    ? "not_connected"
    : confluence.status === "DISCONNECTED"
      ? "error"
      : !confluence.cloud_id || confluence.spaces.length === 0
        ? "target_not_selected"
        : "connected";

  const handleGithubConnect = async () => {
    try {
      const { url } = await githubAPI.getInstallUrl(boardId);
      // 같은 탭으로 보낸다. 새 탭으로 열면 설치 후 돌아오는 리다이렉트가
      // 그 탭에 떨어져서 여기서 installation_id를 받을 수 없다.
      window.location.href = url;
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "GitHub App이 서버에 설정되지 않았습니다.",
      );
    }
  };

  const handleLoadRepos = async () => {
    try {
      setRepos(await githubAPI.listRepos(boardId));
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "저장소 목록을 불러오지 못했습니다.",
      );
    }
  };

  const toggleRepo = async (repo: GithubAvailableRepo) => {
    if (!repos) return;
    const next = repos.map((r) =>
      r.full_name === repo.full_name ? { ...r, selected: !r.selected } : r,
    );
    setRepos(next);
    try {
      const status = await githubAPI.selectRepos(
        boardId,
        next
          .filter((r) => r.selected)
          .map((r) => ({ repo_full_name: r.full_name })),
      );
      setGithub(status);
    } catch (e) {
      setRepos(repos); // 실패하면 되돌린다
      setError(
        (e as { message?: string })?.message ?? "저장소 선택에 실패했습니다.",
      );
    }
  };

  const handleConfluenceConnect = async () => {
    try {
      const { oauth_url } = await confluenceAPI.getOAuthUrl(
        boardId,
        window.location.origin,
      );
      window.location.href = oauth_url;
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "Confluence OAuth 앱이 서버에 설정되지 않았습니다.",
      );
    }
  };

  const handleLoadSites = async () => {
    try {
      setSites(await confluenceAPI.listSites(boardId));
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "사이트 목록을 불러오지 못했습니다.",
      );
    }
  };

  const handleSelectSite = async (site: ConfluenceSiteRef) => {
    try {
      const status = await confluenceAPI.selectSite(boardId, {
        cloud_id: site.cloud_id,
        base_url: site.url,
        site_name: site.name,
      });
      setConfluence(status);
      setSites(null);
      setSpaces(await confluenceAPI.listSpaces(boardId));
    } catch (e) {
      setError(
        (e as { message?: string })?.message ?? "사이트 선택에 실패했습니다.",
      );
    }
  };

  const handleSaveSpace = async () => {
    if (!spaceKey.trim() || !label.trim()) return;
    try {
      const status = await confluenceAPI.selectSpaces(boardId, [
        {
          space_key: spaceKey.trim(),
          match_rule: "LABEL",
          label: label.trim(),
        },
      ]);
      setConfluence(status);
    } catch (e) {
      setError(
        (e as { message?: string })?.message ?? "스페이스 저장에 실패했습니다.",
      );
    }
  };

  const runPreview = async (type: "DAILY_DEV" | "WEEKLY_INTEGRATED") => {
    setPreviewLoading(true);
    setPreview(null);
    setError(null);
    try {
      setPreview(await autoReportAPI.preview(boardId, type));
    } catch (e) {
      setError(
        (e as { message?: string })?.message ?? "미리보기에 실패했습니다.",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const runDispatch = async (type: "DAILY_DEV" | "WEEKLY_INTEGRATED") => {
    setDispatching(true);
    setNotice(null);
    setError(null);
    try {
      const { report_id } = await autoReportAPI.dispatchNow(boardId, type);
      setNotice(`보고서를 발송했습니다. (${report_id.slice(0, 8)})`);
    } catch (e) {
      setError(
        (e as { message?: string })?.message ?? "발송에 실패했습니다.",
      );
    } finally {
      setDispatching(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      <p className="text-xs text-slate-400 leading-relaxed">
        매일 아침 전날 커밋으로 일일보고서를, 주말에 칸반·커밋·Confluence를 합쳐
        주간보고서를 만들어 슬랙에 올립니다. 본문은 웹 페이지로 발행되고 슬랙에는
        요약만 나갑니다.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <span className="text-xs text-rose-500">{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-bridge-accent/10 border border-bridge-accent/20">
          <Check className="w-4 h-4 text-bridge-accent shrink-0 mt-0.5" />
          <span className="text-xs text-bridge-accent">{notice}</span>
        </div>
      )}

      {/* ── 소스 카드 세 장 ────────────────────── */}
      <SourceCard
        icon={<Github className="w-4 h-4" />}
        title="GitHub"
        state={githubState}
        description={
          github?.connected
            ? `${github.account_login} · ${github.scope === "ORGANIZATION" ? "조직 연결" : "보드 연결"} · 저장소 ${github.selected_repos.length}개`
            : "커밋을 읽어옵니다. 조직에 한 번 설치하면 다른 보드도 재인증 없이 씁니다."
        }
      >
        {github?.app_configured === false && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            서버에 GitHub App이 설정되지 않았습니다. 관리자에게 문의하세요.
          </p>
        )}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {!github?.connected ? (
              <button
                onClick={handleGithubConnect}
                className="px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                GitHub App 설치
              </button>
            ) : (
              <button
                onClick={handleLoadRepos}
                className="px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                저장소 목록
              </button>
            )}
          </div>
        )}
        {repos && (
          <div className="flex flex-col gap-1 max-h-56 overflow-y-auto custom-scrollbar">
            {repos.length === 0 && (
              <span className="text-xs text-slate-500">
                설치에 포함된 저장소가 없습니다. GitHub에서 저장소 접근 권한을
                확인해주세요.
              </span>
            )}
            {repos.map((repo) => (
              <label
                key={repo.full_name}
                className="flex items-center gap-2 py-1.5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={repo.selected}
                  onChange={() => toggleRepo(repo)}
                  className="accent-bridge-accent"
                />
                <span className="text-xs text-foreground flex-1 truncate">
                  {repo.full_name}
                </span>
                <span className="text-xs text-slate-600">
                  {repo.default_branch}
                </span>
              </label>
            ))}
          </div>
        )}
      </SourceCard>

      <SourceCard
        icon={<Trello className="w-4 h-4" />}
        title="칸반 보드"
        state="connected"
        description="이 보드의 완료·진행 중·지연 태스크를 집계합니다. 별도 연결이 필요 없습니다."
      />

      <SourceCard
        icon={<FileText className="w-4 h-4" />}
        title="Confluence"
        state={confluenceState}
        description={
          confluence?.connected
            ? `${confluence.site_name ?? confluence.base_url ?? "사이트 미선택"} · 스페이스 ${confluence.spaces.length}개`
            : "그 주의 주간보고 페이지를 읽어옵니다. JIRA와 별개의 연결입니다."
        }
      >
        {confluence?.app_configured === false && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            서버에 Confluence OAuth 앱이 설정되지 않았습니다.
          </p>
        )}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {!confluence?.connected ? (
              <button
                onClick={handleConfluenceConnect}
                className="px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Confluence 연결
              </button>
            ) : (
              <button
                onClick={handleLoadSites}
                className="px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                사이트 선택
              </button>
            )}
          </div>
        )}

        {sites && (
          <div className="flex flex-col gap-1">
            {sites.map((site) => (
              <button
                key={site.cloud_id}
                onClick={() => handleSelectSite(site)}
                disabled={!site.confluence_available}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
              >
                <span className="text-xs text-foreground flex-1 truncate">
                  {site.name}
                  <span className="text-slate-500"> · {site.url}</span>
                </span>
                {!site.confluence_available && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Confluence 권한 없음
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {confluence?.cloud_id && canManage && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={spaceKey}
                onChange={(e) => setSpaceKey(e.target.value)}
                placeholder="스페이스 키 (예: TEAM)"
                list="confluence-space-keys"
                className="flex-1 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="주간보고 라벨"
                className="flex-1 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
              <button
                onClick={handleSaveSpace}
                className="px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all"
              >
                저장
              </button>
            </div>
            {spaces && (
              <datalist id="confluence-space-keys">
                {spaces.map((space) => (
                  <option key={space.key} value={space.key}>
                    {space.name}
                  </option>
                ))}
              </datalist>
            )}
            <p className="text-xs text-slate-600">
              라벨이 붙은 페이지만 읽습니다. 라벨을 비우면 저장되지 않습니다 —
              스페이스 전체가 딸려오는 것을 막기 위해서입니다.
            </p>
          </div>
        )}

        {confluence?.spaces && confluence.spaces.length > 0 && (
          <div className="flex flex-col gap-1">
            {confluence.spaces.map((space) => (
              <div
                key={space.space_key}
                className="flex items-center gap-2 text-xs text-slate-400"
              >
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-foreground">{space.space_key}</span>
                <span>· {space.match_rule}</span>
                {space.label && <span>· {space.label}</span>}
              </div>
            ))}
          </div>
        )}
      </SourceCard>

      {/* ── 발송 시각 ──────────────────────────── */}
      {config && (
        <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
          <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06] border-b border-foreground/[0.06] flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            <span className="text-xs md:text-sm font-bold text-foreground flex-1">
              발송 시각
            </span>
            {saving && (
              <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
            )}
          </div>
          <div className="bg-bridge-dark p-3 md:p-5 flex flex-col gap-4">
            {/* 일일 */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.daily_enabled}
                  disabled={!canManage}
                  onChange={(e) =>
                    patchConfig({ daily_enabled: e.target.checked })
                  }
                  className="accent-bridge-accent"
                />
                <span className="text-xs font-bold text-foreground">
                  일일 보고서
                </span>
              </label>
              <input
                type="time"
                value={`${String(config.daily_hour).padStart(2, "0")}:${String(config.daily_minute).padStart(2, "0")}`}
                disabled={!canManage}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  void patchConfig({ daily_hour: h, daily_minute: m });
                }}
                className="bg-foreground/[0.03] border border-foreground/10 rounded-xl py-1.5 px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              />
              <span className="text-xs text-slate-500">{config.timezone}</span>
            </div>

            {/* 주간 */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.weekly_enabled}
                  disabled={!canManage}
                  onChange={(e) =>
                    patchConfig({ weekly_enabled: e.target.checked })
                  }
                  className="accent-bridge-accent"
                />
                <span className="text-xs font-bold text-foreground">
                  주간 보고서
                </span>
              </label>
              <select
                value={config.weekly_day_of_week}
                disabled={!canManage}
                onChange={(e) =>
                  patchConfig({ weekly_day_of_week: Number(e.target.value) })
                }
                className="bg-foreground/[0.03] border border-foreground/10 rounded-xl py-1.5 px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              >
                {DAY_LABELS.map((day, index) => (
                  <option key={day} value={index + 1}>
                    {day}요일
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={`${String(config.weekly_hour).padStart(2, "0")}:${String(config.weekly_minute).padStart(2, "0")}`}
                disabled={!canManage}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  void patchConfig({ weekly_hour: h, weekly_minute: m });
                }}
                className="bg-foreground/[0.03] border border-foreground/10 rounded-xl py-1.5 px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.share_link_enabled}
                disabled={!canManage}
                onChange={(e) =>
                  patchConfig({ share_link_enabled: e.target.checked })
                }
                className="accent-bridge-accent"
              />
              <span className="text-xs text-foreground">
                공유 링크 발급 (슬랙 버튼이 로그인 없이 열립니다)
              </span>
            </label>
            <p className="text-xs text-slate-600 -mt-2">
              끄면 이후 보고서에 공유 링크가 생기지 않고, 슬랙 버튼은 보드로
              이동합니다.
            </p>
          </div>
        </div>
      )}

      {/* ── 미리보기 · 즉시 발송 ────────────────── */}
      {canManage && (
        <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
          <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06] border-b border-foreground/[0.06]">
            <span className="text-xs md:text-sm font-bold text-foreground">
              확인
            </span>
          </div>
          <div className="bg-bridge-dark p-3 md:p-5 flex flex-col gap-3">
            <p className="text-xs text-slate-500">
              미리보기는 수집만 해봅니다(AI 미호출). 0건이 나오면 라벨이나
              브랜치 설정이 잘못된 것입니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => runPreview("DAILY_DEV")}
                disabled={previewLoading}
                className="px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {previewLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                일일 미리보기
              </button>
              <button
                onClick={() => runPreview("WEEKLY_INTEGRATED")}
                disabled={previewLoading}
                className="px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                주간 미리보기
              </button>
              <button
                onClick={() => runDispatch("DAILY_DEV")}
                disabled={dispatching}
                className="px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {dispatching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                지금 발송
              </button>
            </div>

            {preview && (
              <div className="flex flex-col gap-2 pt-2 border-t border-foreground/[0.08]">
                <span className="text-xs text-slate-500">
                  {preview.period_label} · {preview.timezone}
                </span>
                {preview.sources.map((source) => (
                  <div
                    key={source.kind}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        !source.configured
                          ? "bg-slate-600"
                          : source.success && source.has_data
                            ? "bg-emerald-500"
                            : source.success
                              ? "bg-amber-500"
                              : "bg-rose-500"
                      }`}
                    />
                    <span className="text-foreground font-medium">
                      {source.kind}
                    </span>
                    <span className="text-slate-400">
                      {source.summary ?? source.error_message ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 지난 보고서 ────────────────────────── */}
      <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
        <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06] border-b border-foreground/[0.06] flex items-center gap-2">
          <span className="text-xs md:text-sm font-bold text-foreground flex-1">
            지난 보고서
          </span>
          <button
            onClick={loadHistory}
            className="text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg p-1 transition-colors"
            aria-label="이력 새로고침"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="bg-bridge-dark p-3 md:p-5 flex flex-col gap-1">
          {history === null ? (
            <span className="text-xs text-slate-500">
              새로고침을 눌러 이력을 불러옵니다.
            </span>
          ) : history.length === 0 ? (
            <span className="text-xs text-slate-500">
              아직 생성된 보고서가 없습니다.
            </span>
          ) : (
            history.map((report) => (
              <a
                key={report.id}
                href={`/boards/${boardId}/reports/${report.id}`}
                className="flex items-center gap-2 py-1.5 text-xs hover:bg-foreground/5 rounded-lg px-2 -mx-2 transition-colors"
              >
                <span className="text-bridge-accent font-medium">
                  {report.report_type === "WEEKLY_INTEGRATED" ? "주간" : "일일"}
                </span>
                <span className="text-foreground flex-1 truncate">
                  {report.period_start} ~ {report.period_end}
                </span>
                {report.source_status?.some((s) => !s.success) && (
                  <span className="text-amber-600 dark:text-amber-400">
                    일부 실패
                  </span>
                )}
                <ExternalLink className="w-3 h-3 text-slate-600" />
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
