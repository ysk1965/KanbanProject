import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  ExternalLink,
  FileText,
  Github,
  Hash,
  Loader2,
  Lock,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
  Trello,
  Unlink,
  X,
} from "lucide-react";

import {
  autoReportAPI,
  confluenceAPI,
  githubAPI,
  slackAppAPI,
  type ConfluenceSiteRef,
  type ConfluenceSpaceRef,
  type AutoReport,
  type ConfluenceStatus,
  type GithubAvailableRepo,
  type GithubStatus,
  type ReportConfig,
  type SlackAppInstallation,
  type SlackChannel,
} from "../utils/api";
import { MotionModal } from "./ui/MotionModal";
import { AutoReportView } from "./AutoReportView";

interface AutoReportSettingsPanelProps {
  boardId: string;
  /** 관리자만 연결·설정을 바꿀 수 있다 */
  canManage: boolean;
  /** 스토리지 보고서 탭 드로어에서는 인트로 문구를 헤더가 대신하므로 숨긴다 */
  hideIntro?: boolean;
  /** 스토리지 보고서 탭에서는 갤러리가 지난 보고서를 대신하므로 숨긴다 */
  hideHistory?: boolean;
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 다음 자동 발송까지 남은 시간과 그 슬롯. 켜진 일일/주간 예약 중 가장 이른 것을 고른다.
 * 시각은 보드 타임존의 벽시계로 다룬다(서버가 config에 로컬 시각으로 내려준다). 예약이 없으면 null.
 */
function nextDispatchInfo(
  config: ReportConfig,
): { relative: string; detail: string } | null {
  if (!config.daily_enabled && !config.weekly_enabled) return null;
  let nowDow: number;
  let nowMin: number;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: config.timezone || "Asia/Seoul",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const dowMap: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    nowDow = dowMap[get("weekday")] ?? 1;
    nowMin = Number(get("hour")) * 60 + Number(get("minute"));
  } catch {
    return null;
  }

  const cands: { mins: number; detail: string }[] = [];
  if (config.daily_enabled) {
    let d = config.daily_hour * 60 + config.daily_minute - nowMin;
    if (d <= 0) d += 1440;
    cands.push({
      mins: d,
      detail: `일일 · 매일 ${pad2(config.daily_hour)}:${pad2(config.daily_minute)}`,
    });
  }
  if (config.weekly_enabled) {
    const dayDiff = (config.weekly_day_of_week - nowDow + 7) % 7;
    let d =
      dayDiff * 1440 +
      (config.weekly_hour * 60 + config.weekly_minute - nowMin);
    if (d <= 0) d += 7 * 1440;
    const dayLabel = DAY_LABELS[(config.weekly_day_of_week - 1 + 7) % 7] ?? "";
    cands.push({
      mins: d,
      detail: `주간 · ${dayLabel} ${pad2(config.weekly_hour)}:${pad2(config.weekly_minute)}`,
    });
  }
  cands.sort((a, b) => a.mins - b.mins);
  const n = cands[0];
  const days = Math.floor(n.mins / 1440);
  const hrs = Math.floor((n.mins % 1440) / 60);
  const mins = n.mins % 60;
  const relative =
    days >= 1
      ? `${days}일 ${hrs}시간 후`
      : hrs >= 1
        ? `${hrs}시간 ${mins}분 후`
        : `${mins}분 후`;
  return { relative, detail: n.detail };
}

type StepId = 1 | 2 | 3;

/** 상단 스텝바: 수집 → 발송(테스트) → 생성. 3단계는 발송 테스트 전까지 잠금. */
function StepBar({
  step,
  onSelect,
  s1Sub,
  s2Sub,
  s2State,
  s3Sub,
  s3Locked,
}: {
  step: StepId;
  onSelect: (s: StepId) => void;
  s1Sub: string;
  s2Sub: string;
  s2State: "ok" | "warn";
  s3Sub: string;
  s3Locked: boolean;
}) {
  const items: {
    id: StepId;
    name: string;
    sub: string;
    led: string;
    locked?: boolean;
  }[] = [
    { id: 1, name: "수집", sub: s1Sub, led: "bg-emerald-500" },
    {
      id: 2,
      name: "발송",
      sub: s2Sub,
      led: s2State === "ok" ? "bg-emerald-500" : "bg-amber-500",
    },
    {
      id: 3,
      name: "생성",
      sub: s3Sub,
      led: s3Locked ? "bg-slate-600" : "bg-emerald-500",
      locked: s3Locked,
    },
  ];
  return (
    <div className="flex items-stretch gap-1 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03] p-1.5">
      {items.map((it, i) => (
        <div key={it.id} className="flex items-center flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onSelect(it.id)}
            aria-current={step === it.id}
            className={`relative flex items-center gap-2.5 flex-1 min-w-0 rounded-xl px-2.5 py-2 text-left transition-colors ${
              step === it.id
                ? "bg-bridge-accent/15 ring-1 ring-bridge-accent/40"
                : "hover:bg-foreground/5"
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
                step === it.id
                  ? "bg-bridge-accent text-white"
                  : "bg-foreground/[0.06] text-slate-400 border border-foreground/10"
              }`}
            >
              {it.locked ? <Lock className="w-3 h-3" /> : it.id}
            </span>
            <span className="min-w-0 hidden sm:block">
              <span className="block text-xs font-bold text-foreground leading-tight">
                {it.name}
              </span>
              <span className="block text-xs text-slate-500 truncate leading-tight">
                {it.sub}
              </span>
            </span>
            <span className="sm:hidden text-xs font-bold text-foreground">
              {it.name}
            </span>
            <span
              className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${it.led}`}
            />
          </button>
          {i < items.length - 1 && (
            <ChevronRight className="w-4 h-4 text-slate-600 shrink-0 mx-0.5" />
          )}
        </div>
      ))}
    </div>
  );
}

/** 연결 카드가 공유하는 상태 어휘 — 백엔드 IntegrationConnectionStatus와 같다 */
type CardState =
  "not_connected" | "target_not_selected" | "connected" | "error";

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

/** 수집 소스의 필수/선택 성격 뱃지 — 칸반은 필수·자동, 나머지는 선택이다. */
function KindTag({ kind }: { kind: "required" | "optional" }) {
  return kind === "required" ? (
    <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-bridge-secondary/15 text-bridge-secondary">
      필수 · 자동
    </span>
  ) : (
    <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-foreground/[0.06] text-slate-500 border border-foreground/10">
      선택
    </span>
  );
}

function SourceCard({
  icon,
  title,
  tag,
  state,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tag?: "required" | "optional";
  state: CardState;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
      <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06] border-b border-foreground/[0.06] flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <span className="text-xs md:text-sm font-bold text-foreground flex items-center gap-2">
          {title}
          {tag && <KindTag kind={tag} />}
        </span>
        <span className="flex-1" />
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
  hideIntro = false,
  hideHistory = false,
}: AutoReportSettingsPanelProps) {
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [github, setGithub] = useState<GithubStatus | null>(null);
  const [confluence, setConfluence] = useState<ConfluenceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [repos, setRepos] = useState<GithubAvailableRepo[] | null>(null);
  const [branchLists, setBranchLists] = useState<Record<string, string[]>>({});
  const [branchLoading, setBranchLoading] = useState<string | null>(null);
  const [sites, setSites] = useState<ConfluenceSiteRef[] | null>(null);
  const [spaces, setSpaces] = useState<ConfluenceSpaceRef[] | null>(null);
  const [spaceKey, setSpaceKey] = useState("");
  // 주간보고 페이지 식별 규칙. 백엔드는 LABEL / PARENT_PAGE / TITLE_PATTERN / PARENT_TREE_CHANGELOG 를 지원한다.
  // Confluence가 라벨이 아니라 페이지 계층(년→월→주차)으로 구성된 경우가 많아 규칙을 고르게 한다.
  // PARENT_TREE_CHANGELOG: 부모 하나를 잡고 그 하위 트리에서 기간 내 추가·수정·삭제 변경만 수집.
  const [matchRule, setMatchRule] = useState<
    "LABEL" | "PARENT_PAGE" | "TITLE_PATTERN" | "PARENT_TREE_CHANGELOG"
  >("LABEL");
  const [ruleValue, setRuleValue] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // 발송 채널(슬랙): 설치 상태로 기본 채널을 보여주고, 채널 목록에서 리포트 전용 채널을 고른다.
  const [slackApp, setSlackApp] = useState<SlackAppInstallation | null>(null);
  const [channels, setChannels] = useState<SlackChannel[] | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [showChannelPicker, setShowChannelPicker] = useState(false);
  const [channelQuery, setChannelQuery] = useState("");
  const [manualChannel, setManualChannel] = useState("");
  const [resolvingChannel, setResolvingChannel] = useState(false);

  // 수집 채널(슬랙): 발송과 별개로, 봇이 대화를 "읽어올" 채널을 지정한다.
  const [collectChannel, setCollectChannel] = useState("");
  const [resolvingCollect, setResolvingCollect] = useState(false);

  const [rendered, setRendered] = useState<AutoReport | null>(null);
  const [renderOpen, setRenderOpen] = useState(false);
  const [renderLoading, setRenderLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderType, setRenderType] = useState<
    "DAILY_DEV" | "WEEKLY_INTEGRATED"
  >("DAILY_DEV");
  const [dispatching, setDispatching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<AutoReport[] | null>(null);

  // 스텝 마법사: 수집(1) → 발송·테스트(2) → 생성·예약(3)
  const [step, setStep] = useState<StepId>(1);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

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
      const [configRes, githubRes, confluenceRes, slackRes] =
        await Promise.allSettled([
          autoReportAPI.getConfig(boardId),
          githubAPI.getStatus(boardId),
          confluenceAPI.getStatus(boardId),
          slackAppAPI.getStatus(boardId),
        ]);
      if (configRes.status === "fulfilled") setConfig(configRes.value);
      if (githubRes.status === "fulfilled") setGithub(githubRes.value);
      if (confluenceRes.status === "fulfilled")
        setConfluence(confluenceRes.value);
      if (slackRes.status === "fulfilled") setSlackApp(slackRes.value);
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

  const loadChannels = async () => {
    if (channels) {
      setShowChannelPicker((v) => !v);
      return;
    }
    setLoadingChannels(true);
    setError(null);
    try {
      // 커서를 따라 전체 채널을 모은다(한 페이지 100개). 검색이 첫 100개에만
      // 걸리지 않도록. 폭주 방지로 최대 10페이지(1000개)까지만.
      const all: SlackChannel[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 10; page++) {
        const data = await slackAppAPI.listChannels(boardId, cursor);
        all.push(...data.channels);
        if (!data.next_cursor) break;
        cursor = data.next_cursor;
      }
      setChannels(all);
      setShowChannelPicker(true);
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "슬랙 채널 목록을 불러오지 못했습니다. 슬랙 연결을 확인하세요.",
      );
    } finally {
      setLoadingChannels(false);
    }
  };

  /** 채널 선택. null이면 지정 해제(설치 기본 채널로 발송). */
  const selectChannel = (ch: SlackChannel | null) => {
    setShowChannelPicker(false);
    setChannelQuery("");
    void patchConfig({
      slack_channel_id: ch ? ch.id : "",
      slack_channel_name: ch ? ch.name : "",
    });
  };

  /**
   * 채널 ID·링크 직접 지정. 워크스페이스 채널이 많아 목록/검색에 안 잡히는 채널을
   * ID(C…)나 슬랙 링크(.../archives/C…)로 붙여넣어 conversations.info로 검증 후 저장.
   */
  const applyManualChannel = async () => {
    const raw = manualChannel.trim();
    const m =
      raw.match(/\/archives\/(C[A-Z0-9]+)/i) || raw.match(/^(C[A-Z0-9]{6,})$/i);
    const channelId = m ? m[1].toUpperCase() : null;
    if (!channelId) {
      setError("채널 ID(C로 시작) 또는 슬랙 채널 링크를 입력하세요.");
      return;
    }
    setResolvingChannel(true);
    setError(null);
    try {
      const ch = await slackAppAPI.getChannelInfo(boardId, channelId);
      setManualChannel("");
      await patchConfig({
        slack_channel_id: ch.id,
        slack_channel_name: ch.name,
      });
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "채널을 찾을 수 없거나 봇이 접근할 수 없습니다. 채널에 MILKYWAY를 초대했는지 확인하세요.",
      );
    } finally {
      setResolvingChannel(false);
    }
  };

  /** 수집 대상 슬랙 채널 지정. 발송 채널과 같은 방식(ID·링크 → conversations.info 검증)이되 별도 필드에 저장. */
  const applyCollectChannel = async () => {
    const raw = collectChannel.trim();
    const m =
      raw.match(/\/archives\/(C[A-Z0-9]+)/i) || raw.match(/^(C[A-Z0-9]{6,})$/i);
    const channelId = m ? m[1].toUpperCase() : null;
    if (!channelId) {
      setError("채널 ID(C로 시작) 또는 슬랙 채널 링크를 입력하세요.");
      return;
    }
    setResolvingCollect(true);
    setError(null);
    try {
      const ch = await slackAppAPI.getChannelInfo(boardId, channelId);
      setCollectChannel("");
      await patchConfig({
        source_slack_channel_id: ch.id,
        source_slack_channel_name: ch.name,
      });
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "채널을 찾을 수 없거나 봇이 접근할 수 없습니다. 채널에 MILKYWAY를 초대했는지 확인하세요.",
      );
    } finally {
      setResolvingCollect(false);
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

  const slackCollectState: CardState = !slackApp
    ? "not_connected"
    : !config?.source_slack_channel_id
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

  // 선택된 저장소의 현재 브랜치("" 이면 저장소 기본 브랜치)
  const selectedBranchOf = (fullName: string): string =>
    github?.selected_repos.find((r) => r.repo_full_name === fullName)?.branch ??
    "";

  const persistRepoSelection = async (
    selections: { repo_full_name: string; branch: string }[],
  ) => {
    const status = await githubAPI.selectRepos(boardId, selections);
    setGithub(status);
  };

  const toggleRepo = async (repo: GithubAvailableRepo) => {
    if (!repos) return;
    const next = repos.map((r) =>
      r.full_name === repo.full_name ? { ...r, selected: !r.selected } : r,
    );
    setRepos(next);
    try {
      // 각 저장소의 브랜치를 함께 실어 보내 다른 저장소의 선택이 초기화되지 않게 한다.
      await persistRepoSelection(
        next
          .filter((r) => r.selected)
          .map((r) => ({
            repo_full_name: r.full_name,
            branch: selectedBranchOf(r.full_name),
          })),
      );
    } catch (e) {
      setRepos(repos); // 실패하면 되돌린다
      setError(
        (e as { message?: string })?.message ?? "저장소 선택에 실패했습니다.",
      );
    }
  };

  const changeRepoBranch = async (
    repo: GithubAvailableRepo,
    branch: string,
  ) => {
    if (!repos) return;
    try {
      await persistRepoSelection(
        repos
          .filter((r) => r.selected)
          .map((r) => ({
            repo_full_name: r.full_name,
            branch:
              r.full_name === repo.full_name
                ? branch
                : selectedBranchOf(r.full_name),
          })),
      );
    } catch (e) {
      setError(
        (e as { message?: string })?.message ?? "브랜치 변경에 실패했습니다.",
      );
    }
  };

  const loadBranches = async (repo: GithubAvailableRepo) => {
    if (branchLists[repo.full_name] || branchLoading === repo.full_name) return;
    setBranchLoading(repo.full_name);
    try {
      const list = await githubAPI.listBranches(boardId, repo.full_name);
      setBranchLists((prev) => ({ ...prev, [repo.full_name]: list }));
    } catch {
      // 목록을 못 가져와도 기본 브랜치는 쓸 수 있으니 조용히 넘어간다.
    } finally {
      setBranchLoading(null);
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
    if (!spaceKey.trim() || !ruleValue.trim()) return;
    try {
      const v = ruleValue.trim();
      const status = await confluenceAPI.selectSpaces(boardId, [
        {
          space_key: spaceKey.trim(),
          match_rule: matchRule,
          label: matchRule === "LABEL" ? v : null,
          parent_page_id:
            matchRule === "PARENT_PAGE" || matchRule === "PARENT_TREE_CHANGELOG"
              ? v
              : null,
          title_pattern: matchRule === "TITLE_PATTERN" ? v : null,
        },
      ]);
      setConfluence(status);
      setSpaceKey("");
      setRuleValue("");
    } catch (e) {
      setError(
        (e as { message?: string })?.message ?? "스페이스 저장에 실패했습니다.",
      );
    }
  };

  const handleDisconnect = async () => {
    try {
      await confluenceAPI.disconnect(boardId);
      setConfluence(await confluenceAPI.getStatus(boardId));
      setSites(null);
      setSpaces(null);
      setConfirmDisconnect(false);
    } catch (e) {
      setError(
        (e as { message?: string })?.message ?? "연결 해제에 실패했습니다.",
      );
    }
  };

  /** 실제 보고서를 만들어 모달에 렌더링한다 (발송 없음). 수집 0건이면 AI를 태우지 않고 안내만 뜬다. */
  const runRenderPreview = async (type: "DAILY_DEV" | "WEEKLY_INTEGRATED") => {
    setRenderType(type);
    setRenderOpen(true);
    setRenderLoading(true);
    setRendered(null);
    setRenderError(null);
    try {
      setRendered(await autoReportAPI.renderPreview(boardId, type));
    } catch (e) {
      setRenderError(
        (e as { message?: string })?.message ?? "미리보기 생성에 실패했습니다.",
      );
    } finally {
      setRenderLoading(false);
    }
  };

  const runDispatch = async (type: "DAILY_DEV" | "WEEKLY_INTEGRATED") => {
    setDispatching(true);
    setNotice(null);
    setError(null);
    try {
      const { status, report_id, message } = await autoReportAPI.dispatchNow(
        boardId,
        type,
      );
      if (status === "SKIPPED") {
        setNotice(message ?? "기간 내 활동이 없어 이번 발송은 건너뛰었습니다.");
      } else if (status === "FAILED") {
        // 보고서는 만들어졌어도(REQUIRES_NEW) 슬랙 게시가 실패하면 FAILED다.
        // 성공처럼 보이지 않게 오류로 정직하게 알린다.
        setError(
          message ??
            "보고서는 만들었지만 슬랙 게시에 실패했습니다. 발송 채널에 봇(MILKYWAY)이 초대돼 있는지 확인하세요.",
        );
      } else if (report_id) {
        setNotice(
          status === "PARTIAL"
            ? `보고서를 발송했습니다 — 일부 소스는 수집에 실패했습니다. (${report_id.slice(0, 8)})`
            : `보고서를 발송했습니다. (${report_id.slice(0, 8)})`,
        );
      } else {
        setNotice(message ?? "보고서를 발송했습니다.");
      }
    } catch (e) {
      setError((e as { message?: string })?.message ?? "발송에 실패했습니다.");
    } finally {
      setDispatching(false);
    }
  };

  /**
   * 발송 테스트 — 자동 예약을 켜기 전에 채널·권한만 검증한다. 확인 메시지 한 장을 발송 채널에
   * 게시하고, 성공하면 백엔드가 그 채널을 "테스트 통과"로 기록한다. config를 다시 받아 잠금을 푼다.
   */
  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await autoReportAPI.sendTest(boardId);
      if (res.success) {
        setTestResult({
          ok: true,
          message: `#${res.channel_name ?? res.channel_id} 에 테스트 메시지를 보냈습니다. 이제 자동 예약을 켤 수 있어요.`,
        });
        // test_passed_channel_id가 채워져 생성 단계 잠금이 풀린다.
        setConfig(await autoReportAPI.getConfig(boardId));
      } else {
        setTestResult({
          ok: false,
          message: res.message ?? "발송 테스트에 실패했습니다.",
        });
      }
    } catch (e) {
      setTestResult({
        ok: false,
        message:
          (e as { message?: string })?.message ?? "발송 테스트에 실패했습니다.",
      });
    } finally {
      setTesting(false);
    }
  };

  // ── 발송 테스트 게이팅 ────────────────────────────
  // 발송에 실제로 쓰일 채널(지정 없으면 슬랙 설치 기본 채널)과, 마지막으로 테스트에 성공한
  // 채널이 같아야 자동 예약을 켤 수 있다. 채널을 바꾸면 값이 어긋나 다시 잠긴다.
  const effectiveChannelId =
    config?.slack_channel_id || slackApp?.default_channel_id || null;
  const dispatchTested =
    !!config?.test_passed_channel_id &&
    !!effectiveChannelId &&
    config.test_passed_channel_id === effectiveChannelId;
  // 이미 예약이 켜져 있던 기존 설정은 잠그지 않는다(회귀 방지).
  const scheduleUnlocked =
    dispatchTested || !!config?.daily_enabled || !!config?.weekly_enabled;
  const next = config ? nextDispatchInfo(config) : null;

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      {!hideIntro && (
        <p className="text-xs text-slate-400 leading-relaxed">
          <b className="text-foreground font-medium">
            수집 → 발송(테스트) → 생성
          </b>{" "}
          순으로 설정합니다. 무엇을 읽을지 고르고, 발송 채널에 한 번 테스트한
          뒤, 자동 예약을 켜면 됩니다. 본문은 웹 페이지로 발행되고 슬랙에는
          요약만 나갑니다.
        </p>
      )}

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

      {/* ── 다음 발송 요약 ── */}
      {config && (
        <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
          <div className="bg-gradient-to-br from-bridge-accent/10 via-bridge-secondary/[0.04] to-transparent px-4 py-3 md:px-5 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-bridge-accent/15 text-bridge-accent grid place-items-center shrink-0">
              <Clock className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                다음 발송
              </p>
              <p className="text-sm md:text-base font-bold text-foreground truncate">
                {next
                  ? next.relative
                  : scheduleUnlocked
                    ? "예약 꺼짐"
                    : "자동 예약 · 테스트 필요"}
              </p>
              {next && (
                <p className="text-xs text-slate-500 truncate">{next.detail}</p>
              )}
            </div>
            {config.slack_channel_name && (
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-400">
                <Hash className="w-3 h-3 text-bridge-accent" />
                {config.slack_channel_name}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── 스텝바: 수집 → 발송 → 생성 ── */}
      <StepBar
        step={step}
        onSelect={setStep}
        s1Sub="칸반 자동 · 나머지 선택"
        s2Sub={dispatchTested ? "테스트 통과" : "테스트 필요"}
        s2State={dispatchTested ? "ok" : "warn"}
        s3Sub={scheduleUnlocked ? "예약 설정" : "테스트 후 잠금 해제"}
        s3Locked={!scheduleUnlocked}
      />

      {/* ── ① 수집 소스 ─────────────────────────── */}
      {step === 1 && (
        <>
          <p className="text-xs text-slate-500 leading-relaxed">
            <b className="text-foreground font-medium">
              칸반 보드는 자동으로 포함
            </b>
            됩니다. 나머지는 선택 — 연결한 소스만 보고서에 반영됩니다.
          </p>
          <SourceCard
            icon={<Github className="w-4 h-4" />}
            title="GitHub"
            tag="optional"
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
                  <>
                    <button
                      onClick={handleLoadRepos}
                      className="px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      저장소 목록
                    </button>
                    <button
                      onClick={handleGithubConnect}
                      title="GitHub에서 설치의 저장소 접근 권한을 추가·변경합니다"
                      className="px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all inline-flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      저장소 추가
                    </button>
                  </>
                )}
              </div>
            )}
            {repos && (
              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto custom-scrollbar">
                {repos.length === 0 && (
                  <span className="text-xs text-slate-500">
                    설치에 포함된 저장소가 없습니다. 위 "저장소 추가"로
                    GitHub에서 저장소 접근 권한을 추가해주세요.
                  </span>
                )}
                {repos.map((repo) => {
                  const branch = selectedBranchOf(repo.full_name);
                  const branchOptions = Array.from(
                    new Set([
                      ...(branch ? [branch] : []),
                      ...(branchLists[repo.full_name] ?? []),
                    ]),
                  );
                  return (
                    <div
                      key={repo.full_name}
                      className="flex items-center gap-2 py-1.5"
                    >
                      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={repo.selected}
                          onChange={() => toggleRepo(repo)}
                          className="accent-bridge-accent"
                        />
                        <span className="text-xs text-foreground flex-1 truncate">
                          {repo.full_name}
                        </span>
                      </label>
                      {repo.selected ? (
                        <select
                          value={branch}
                          onFocus={() => loadBranches(repo)}
                          onMouseDown={() => loadBranches(repo)}
                          onChange={(e) =>
                            changeRepoBranch(repo, e.target.value)
                          }
                          className="max-w-[45%] bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                          title="보고서에 집계할 브랜치"
                        >
                          <option value="">기본 ({repo.default_branch})</option>
                          {branchOptions.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                          {branchLoading === repo.full_name && (
                            <option value="" disabled>
                              불러오는 중…
                            </option>
                          )}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-600">
                          {repo.default_branch}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SourceCard>

          <SourceCard
            icon={<Trello className="w-4 h-4" />}
            title="칸반 보드"
            tag="required"
            state="connected"
            description="이 보드의 완료·진행 중·지연 태스크를 집계합니다. 별도 연결이 필요 없습니다."
          />

          <SourceCard
            icon={<FileText className="w-4 h-4" />}
            title="Confluence"
            tag="optional"
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
                  <>
                    <button
                      onClick={handleLoadSites}
                      className="px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      사이트 선택
                    </button>
                    {confirmDisconnect ? (
                      <>
                        <button
                          onClick={handleDisconnect}
                          className="px-4 py-2 bg-rose-500/15 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold hover:bg-rose-500/25 transition-all inline-flex items-center gap-1.5"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                          정말 해제
                        </button>
                        <button
                          onClick={() => setConfirmDisconnect(false)}
                          className="px-3 py-2 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-xl text-xs font-medium transition-colors"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDisconnect(true)}
                        className="px-4 py-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/5 rounded-xl text-xs font-medium transition-colors inline-flex items-center gap-1.5"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        연결 해제
                      </button>
                    )}
                  </>
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
                <input
                  value={spaceKey}
                  onChange={(e) => setSpaceKey(e.target.value)}
                  placeholder="스페이스 키 (URL의 /wiki/spaces/키/ — 스페이스 이름 아님)"
                  list="confluence-space-keys"
                  className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={matchRule}
                    onChange={(e) =>
                      setMatchRule(
                        e.target.value as
                          | "LABEL"
                          | "PARENT_PAGE"
                          | "TITLE_PATTERN"
                          | "PARENT_TREE_CHANGELOG",
                      )
                    }
                    className="bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                  >
                    <option value="LABEL">라벨</option>
                    <option value="PARENT_PAGE">부모 페이지</option>
                    <option value="TITLE_PATTERN">제목 패턴</option>
                    <option value="PARENT_TREE_CHANGELOG">
                      부모 트리 변경
                    </option>
                  </select>
                  <input
                    value={ruleValue}
                    onChange={(e) => setRuleValue(e.target.value)}
                    placeholder={
                      matchRule === "LABEL"
                        ? "라벨 (예: weekly-report)"
                        : matchRule === "PARENT_PAGE" ||
                            matchRule === "PARENT_TREE_CHANGELOG"
                          ? "부모 페이지 ID (예: 123456789)"
                          : "제목 포함 문구 (예: 주간 업무 현황)"
                    }
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
                  {matchRule === "LABEL"
                    ? "그 라벨이 붙은 페이지만 읽습니다. 매주 페이지가 달라도 라벨만 같으면 자동으로 찾습니다."
                    : matchRule === "PARENT_PAGE"
                      ? "그 부모 페이지 밑의 자식 페이지를 읽습니다. 페이지 ID는 페이지 URL의 /pages/{ID}/ 에 있습니다."
                      : matchRule === "PARENT_TREE_CHANGELOG"
                        ? "그 부모 페이지 아래 문서 전체에서 해당 기간에 추가·수정·삭제된 변경만 모아 전달합니다. 문서 한 장이 아니라 프로젝트 문서의 변화를 봅니다. 페이지 ID는 URL의 /pages/{ID}/ 에 있습니다."
                        : "제목에 이 문구가 들어간 페이지를 읽습니다. 그 주 기간과 결합해 해당 주 주간보고를 자동으로 찾습니다."}
                  {
                    " 값을 비우면 저장되지 않습니다 — 스페이스 전체가 딸려오는 것을 막기 위해서입니다."
                  }
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
                    <span>
                      ·{" "}
                      {space.match_rule === "PARENT_PAGE"
                        ? "부모 페이지"
                        : space.match_rule === "PARENT_TREE_CHANGELOG"
                          ? "부모 트리 변경"
                          : space.match_rule === "TITLE_PATTERN"
                            ? "제목 패턴"
                            : "라벨"}
                    </span>
                    {(space.label ||
                      space.parent_page_id ||
                      space.title_pattern) && (
                      <span className="text-foreground/80">
                        ·{" "}
                        {space.label ??
                          space.parent_page_id ??
                          space.title_pattern}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SourceCard>

          {/* ── 슬랙 채널 수집 ─────────────────────── */}
          <SourceCard
            icon={<MessageSquare className="w-4 h-4" />}
            title="슬랙 대화 수집"
            tag="optional"
            state={slackCollectState}
            description={
              config?.source_slack_channel_id
                ? `#${config.source_slack_channel_name ?? config.source_slack_channel_id} 의 대화를 읽어옵니다.`
                : "특정 채널의 논의·결정을 근거로 읽어옵니다. 발송 채널과 별개로 지정합니다."
            }
          >
            {!slackApp ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                슬랙 앱이 이 보드에 연결되어 있지 않습니다. 먼저 슬랙을
                연결하세요.
              </p>
            ) : (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config?.source_slack_enabled ?? false}
                    disabled={!canManage}
                    onChange={(e) =>
                      void patchConfig({
                        source_slack_enabled: e.target.checked,
                      })
                    }
                    className="accent-bridge-accent"
                  />
                  <span className="text-xs text-foreground">
                    이 채널을 보고서 근거로 수집
                  </span>
                </label>

                {config?.source_slack_channel_id && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-foreground/[0.03] border border-foreground/10">
                      <Hash className="w-3.5 h-3.5 text-bridge-accent" />
                      <span className="text-xs font-bold text-foreground">
                        {config.source_slack_channel_name ??
                          config.source_slack_channel_id}
                      </span>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() =>
                          void patchConfig({
                            source_slack_channel_id: "",
                            source_slack_channel_name: "",
                          })
                        }
                        className="text-xs text-slate-500 hover:text-foreground"
                      >
                        지정 해제
                      </button>
                    )}
                  </div>
                )}

                {canManage && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={collectChannel}
                        onChange={(e) => setCollectChannel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void applyCollectChannel();
                        }}
                        placeholder="수집할 채널 ID·링크 (C09… 또는 …/archives/C09…)"
                        className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-1.5 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                      />
                      <button
                        type="button"
                        onClick={() => void applyCollectChannel()}
                        disabled={resolvingCollect || !collectChannel.trim()}
                        className="shrink-0 text-xs font-bold text-bridge-accent hover:underline disabled:opacity-50 flex items-center gap-1"
                      >
                        {resolvingCollect ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "지정"
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-600">
                      봇이 채널 대화를 <b>읽으려면</b> 슬랙 앱을 다시 승인해
                      히스토리 권한을 켜고(최초 1회), 그 채널에 MILKYWAY를
                      초대해야 합니다.
                    </p>
                  </div>
                )}
              </>
            )}
          </SourceCard>
        </>
      )}

      {/* ── ② 발송 채널 + 테스트 ─────────────────── */}
      {step === 2 && (
        <p className="text-xs text-slate-500 leading-relaxed">
          자동 예약을 켜기 전에{" "}
          <b className="text-foreground font-medium">
            이 채널로 한 번 테스트 발송
          </b>
          해 채널·권한이 맞는지 확인합니다. 테스트가 성공해야 다음 단계(자동
          예약)가 열립니다.
        </p>
      )}
      {step === 2 && config && (
        <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
          <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06] border-b border-foreground/[0.06] flex items-center gap-2">
            <Hash className="w-4 h-4 text-slate-400" />
            <span className="text-xs md:text-sm font-bold text-foreground flex-1">
              발송 채널
            </span>
            {saving && (
              <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
            )}
          </div>
          <div className="bg-bridge-dark p-3 md:p-5 flex flex-col gap-3">
            <p className="text-xs text-slate-500">
              보고서를 게시할 슬랙 채널입니다. 지정하지 않으면 슬랙 설치의 기본
              채널로 발송됩니다.
            </p>

            {slackApp ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-foreground/[0.03] border border-foreground/10">
                    <Hash className="w-3.5 h-3.5 text-bridge-accent" />
                    <span className="text-xs font-bold text-foreground">
                      {config.slack_channel_name
                        ? config.slack_channel_name
                        : slackApp.default_channel_name
                          ? `${slackApp.default_channel_name} (기본)`
                          : "미지정 (기본 채널)"}
                    </span>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={loadChannels}
                      disabled={loadingChannels}
                      className="text-xs font-bold text-bridge-accent hover:underline disabled:opacity-50 flex items-center gap-1"
                    >
                      {loadingChannels ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      {config.slack_channel_id ? "변경" : "채널 선택"}
                    </button>
                  )}
                  {canManage && config.slack_channel_id && (
                    <button
                      type="button"
                      onClick={() => selectChannel(null)}
                      className="text-xs text-slate-500 hover:text-foreground"
                    >
                      기본 채널로 초기화
                    </button>
                  )}
                </div>

                {showChannelPicker &&
                  channels &&
                  (channels.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <input
                        type="text"
                        value={channelQuery}
                        onChange={(e) => setChannelQuery(e.target.value)}
                        placeholder="채널 이름 검색..."
                        autoFocus
                        className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-1.5 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                      />
                      {(() => {
                        const q = channelQuery.trim().toLowerCase();
                        const filtered = q
                          ? channels.filter((ch) =>
                              ch.name.toLowerCase().includes(q),
                            )
                          : channels;
                        return filtered.length > 0 ? (
                          <div className="max-h-40 overflow-y-auto custom-scrollbar bg-bridge-dark rounded-lg border border-foreground/10">
                            {filtered.map((ch) => (
                              <button
                                key={ch.id}
                                type="button"
                                onClick={() => selectChannel(ch)}
                                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-foreground/5 transition-colors"
                              >
                                <Hash className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="text-xs text-foreground truncate">
                                  {ch.name}
                                </span>
                                {ch.is_private && (
                                  <span className="text-xs">🔒</span>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">
                            "{channelQuery}"에 맞는 채널이 없습니다.
                          </p>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      채널이 없습니다. 봇을 채널에 초대했는지 확인하세요.
                    </p>
                  ))}

                {canManage && (
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-foreground/[0.06] mt-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={manualChannel}
                        onChange={(e) => setManualChannel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void applyManualChannel();
                        }}
                        placeholder="목록에 없으면 채널 ID·링크 직접 입력 (C09… 또는 …/archives/C09…)"
                        className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-1.5 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                      />
                      <button
                        type="button"
                        onClick={() => void applyManualChannel()}
                        disabled={resolvingChannel || !manualChannel.trim()}
                        className="shrink-0 text-xs font-bold text-bridge-accent hover:underline disabled:opacity-50 flex items-center gap-1"
                      >
                        {resolvingChannel ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "지정"
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-600">
                      채널이 아주 많은 워크스페이스라 목록엔 일부만 보입니다. 안
                      보이면 슬랙에서 채널 열기 → 채널명 클릭 → 하단 채널 ID
                      복사(또는 링크 붙여넣기).
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                슬랙 앱이 이 보드에 연결되어 있지 않아 채널을 선택할 수
                없습니다. 먼저 슬랙을 연결하세요.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 발송 테스트 (자동 예약 게이트) */}
      {step === 2 && (
        <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
          <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06] border-b border-foreground/[0.06] flex items-center gap-2">
            <Send className="w-4 h-4 text-slate-400" />
            <span className="text-xs md:text-sm font-bold text-foreground flex-1">
              발송 테스트
            </span>
            <span
              className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                dispatchTested
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              }`}
            >
              {dispatchTested ? "테스트 통과" : "테스트 필요"}
            </span>
          </div>
          <div className="bg-bridge-dark p-3 md:p-5 flex flex-col gap-3">
            <p className="text-xs text-slate-500">
              확인 메시지 한 장을 발송 채널에 보내 채널·권한이 정상인지
              검사합니다. 보고서를 만들지는 않습니다.
            </p>
            {canManage ? (
              <div>
                <button
                  onClick={runTest}
                  disabled={testing}
                  className="px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {testing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {dispatchTested ? "다시 테스트" : "테스트 발송"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                관리자만 발송 테스트를 실행할 수 있습니다.
              </p>
            )}
            {testResult && (
              <div
                className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${
                  testResult.ok
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-500"
                }`}
              >
                {testResult.ok ? (
                  <Check className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
            {!dispatchTested && (
              <p className="text-xs text-slate-600">
                테스트가 성공하면{" "}
                <b className="text-foreground font-medium">생성</b> 단계에서
                자동 예약을 켤 수 있습니다.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── ③ AI 모델 — 잠금과 무관하게 항상 고를 수 있다 ── */}
      {step === 3 && config && (
        <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
          <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06] border-b border-foreground/[0.06] flex items-center gap-2">
            <Cpu className="w-4 h-4 text-slate-400" />
            <span className="text-xs md:text-sm font-bold text-foreground flex-1">
              AI 모델
            </span>
            {saving && (
              <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
            )}
          </div>
          <div className="bg-bridge-dark p-3 md:p-5 flex flex-col gap-3">
            <p className="text-xs text-slate-500">
              보고서 본문을 작성할 모델입니다. 상위 모델은 품질이 오르지만 비용도
              함께 오릅니다. 지정하지 않으면 기본 모델을 사용합니다.
            </p>
            <select
              value={config.ai_model ?? ""}
              disabled={!canManage}
              onChange={(e) => void patchConfig({ ai_model: e.target.value })}
              className="w-full sm:max-w-xs bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all disabled:opacity-50"
            >
              <option value="">
                기본{config.ai_model_default ? ` · ${config.ai_model_default}` : ""}
              </option>
              {(config.available_models ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── ③ 생성(자동 예약) — 발송 테스트 후 잠금 해제 ── */}
      {step === 3 &&
        config &&
        (scheduleUnlocked ? (
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
              {!dispatchTested && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    발송 채널이 마지막으로 테스트한 채널과 달라졌습니다.{" "}
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="font-bold underline hover:text-amber-500"
                    >
                      발송 단계에서 다시 테스트
                    </button>
                    하는 것을 권장합니다.
                  </span>
                </div>
              )}
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
                <span className="text-xs text-slate-500">
                  {config.timezone}
                </span>
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
        ) : (
          <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
            <div className="bg-bridge-dark px-4 py-8 flex flex-col items-center text-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 grid place-items-center">
                <Lock className="w-5 h-5" />
              </span>
              <span className="text-sm font-bold text-foreground">
                발송 테스트를 먼저 완료하세요
              </span>
              <span className="text-xs text-slate-500 max-w-sm leading-relaxed">
                테스트 발송이 성공해야 자동 예약을 켤 수 있습니다. 잘못된 채널로
                매일 자동 발송되는 사고를 막기 위해서입니다.
              </span>
              {canManage && (
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all inline-flex items-center gap-1.5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  발송 테스트하러 가기
                </button>
              )}
            </div>
          </div>
        ))}

      {/* ── 미리보기 · 즉시 발송 (발송 단계) ────────── */}
      {step === 2 && canManage && (
        <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
          <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06] border-b border-foreground/[0.06]">
            <span className="text-xs md:text-sm font-bold text-foreground">
              확인
            </span>
          </div>
          <div className="bg-bridge-dark p-3 md:p-5 flex flex-col gap-3">
            <p className="text-xs text-slate-500">
              미리보기는 실제 발송과 똑같이 수집하고 AI로 작성해 결과를 모달에
              보여줍니다(저장·슬랙 발송은 하지 않음). 수집된 게 없으면 AI를
              호출하지 않고, 라벨·브랜치 설정 점검 안내가 뜹니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => runRenderPreview("DAILY_DEV")}
                disabled={renderLoading}
                className="px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {renderLoading && renderType === "DAILY_DEV" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                일일 미리보기
              </button>
              <button
                onClick={() => runRenderPreview("WEEKLY_INTEGRATED")}
                disabled={renderLoading}
                className="px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {renderLoading && renderType === "WEEKLY_INTEGRATED" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
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

            {/* 발송/미리보기 결과 — 스크롤된 모달에서도 버튼 옆에서 바로 보이도록 여기에도 띄운다 */}
            {(notice || error) && (
              <div
                className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${
                  error
                    ? "bg-rose-500/10 border-rose-500/20 text-rose-500"
                    : "bg-bridge-accent/10 border-bridge-accent/20 text-bridge-accent"
                }`}
              >
                {error ? (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <Check className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{error ?? notice}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 지난 보고서 (발송 단계) ─────────────── */}
      {step === 2 && !hideHistory && (
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
                    {report.report_type === "WEEKLY_INTEGRATED"
                      ? "주간"
                      : "일일"}
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
      )}

      {/* ── 스텝 이동 ──────────────────────────── */}
      <div className="flex items-center gap-2 pt-1">
        {step > 1 && (
          <button
            onClick={() => setStep((s) => (s - 1) as StepId)}
            className="px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all inline-flex items-center gap-1.5"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            이전
          </button>
        )}
        <span className="flex-1" />
        {step < 3 ? (
          <button
            onClick={() => setStep((s) => (s + 1) as StepId)}
            className="px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all inline-flex items-center gap-1.5"
          >
            다음
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-500" />
            설정 완료
          </span>
        )}
      </div>

      {/* ── 렌더링 미리보기 모달 ──────────────────── */}
      <MotionModal
        open={renderOpen}
        onClose={() => setRenderOpen(false)}
        className="sm:max-w-3xl"
        accentColor
        aria-label="보고서 미리보기"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <FileText className="w-4 h-4 text-bridge-accent" />
          <span className="text-sm font-bold text-foreground flex-1">
            {renderType === "WEEKLY_INTEGRATED" ? "주간" : "일일"} 보고서
            미리보기
          </span>
          <span className="text-xs text-slate-600">발송 안 함</span>
          <button
            onClick={() => setRenderOpen(false)}
            aria-label="닫기"
            className="text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-bridge-dark">
          {renderLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
              <span className="text-xs text-slate-500">
                보고서를 생성하는 중… (수집 + AI 작성)
              </span>
            </div>
          ) : renderError ? (
            <div className="flex flex-col items-center gap-2 py-16 px-5 text-center">
              <AlertCircle className="w-6 h-6 text-rose-500" />
              <span className="text-xs text-slate-400">{renderError}</span>
            </div>
          ) : rendered?.content ? (
            <AutoReportView
              report={rendered}
              className="px-5 py-6 flex flex-col gap-5"
            />
          ) : rendered ? (
            <div className="flex flex-col gap-3 py-10 px-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <FileText className="w-6 h-6 text-slate-500" />
                <span className="text-sm font-bold text-foreground">
                  수집된 데이터가 없습니다
                </span>
                <span className="text-xs text-slate-500">
                  이 기간에 잡힌 활동이 없어 보고서를 만들지 않았습니다.
                  라벨·브랜치 설정을 확인하세요.
                </span>
              </div>
              {(rendered.source_status ?? []).length > 0 && (
                <div className="flex flex-col gap-2 pt-3 border-t border-foreground/[0.08]">
                  {(rendered.source_status ?? []).map((source) => (
                    <div
                      key={source.source}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          source.success && source.has_data
                            ? "bg-emerald-500"
                            : source.success
                              ? "bg-amber-500"
                              : "bg-rose-500"
                        }`}
                      />
                      <span className="text-foreground font-medium">
                        {source.source}
                      </span>
                      <span className="text-slate-400">
                        {source.summary ?? source.error ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </MotionModal>
    </div>
  );
}
