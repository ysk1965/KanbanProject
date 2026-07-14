import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Link2,
  FileText,
  Share2,
  SquarePen,
  LayoutGrid,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  X,
  Plus,
  Zap,
  Puzzle,
} from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import { patAPI, PatSummary, PatCreated, BACKEND_ORIGIN } from "../utils/api";

interface McpConnectModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  boardName?: string;
}

type Tab = "features" | "connect";
type TokenMode = "status" | "form";

const INSTALL_CMD =
  "/plugin marketplace add bridge-internal\n/plugin install bridge";
const EXPIRY_OPTIONS = [0, 30, 90, 365]; // 0 = 만료 없음

/** npm 배포될 MCP 서버 패키지명 (원커맨드 npx 실행 대상). */
const MCP_PACKAGE = "@bridgespots/mcp";

/**
 * 값(토큰·API 주소·보드 id)이 박힌 `claude mcp add` 한 줄 명령을 조립한다.
 * 붙여넣고 Enter 한 번으로 설치+연결이 끝난다.
 *
 * apiUrl 은 지금 FE가 붙어있는 백엔드 origin(BACKEND_ORIGIN) — 환경별로 자동
 * (로컬 → localhost, milkyway.pe.kr → milkyway API, bridgespots.com → bridgespots API).
 * 이게 없으면 MCP 서버가 localhost 기본값을 써서 배포 환경 사용자가 연결 실패한다.
 */
function buildInstallCommand(
  token: string,
  apiUrl: string,
  boardId: string,
): string {
  return [
    "claude mcp add bridge --scope user \\",
    `  --env BRIDGE_PAT="${token}" \\`,
    `  --env BRIDGE_API_URL="${apiUrl}" \\`,
    `  --env BRIDGE_DEFAULT_BOARD_ID="${boardId}" \\`,
    `  -- npx -y ${MCP_PACKAGE}`,
  ].join("\n");
}

type ConnectMethod = "oneCommand" | "plugin";

export function McpConnectModal({
  open,
  onClose,
  boardId,
  boardName,
}: McpConnectModalProps) {
  const { t } = useTranslation();

  const [tab, setTab] = useState<Tab>("features");
  const [method, setMethod] = useState<ConnectMethod>("oneCommand");
  const [pats, setPats] = useState<PatSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // 토큰 발급 상태머신
  const [tokenMode, setTokenMode] = useState<TokenMode>("status");
  const [name, setName] = useState("Claude Code");
  const [expiryDays, setExpiryDays] = useState(0);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<PatCreated | null>(null); // 1회 노출 원문

  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPats = useCallback(async () => {
    setLoading(true);
    try {
      setPats(await patAPI.list());
    } catch {
      // 조회 실패는 조용히 — 발급은 여전히 가능
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setTab("features");
      setMethod("oneCommand");
      setTokenMode("status");
      setCreated(null);
      setError(null);
      fetchPats();
    }
  }, [open, fetchPats]);

  const copy = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600);
    } catch {
      /* clipboard 미지원 무시 */
    }
  }, []);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const result = await patAPI.create({
        name,
        expiresInDays: expiryDays === 0 ? null : expiryDays,
      });
      setCreated(result);
      setTokenMode("status");
      fetchPats();
    } catch {
      setError(
        t(
          "mcp.issueError",
          "토큰 발급에 실패했습니다. 잠시 후 다시 시도해주세요.",
        ),
      );
    } finally {
      setCreating(false);
    }
  }, [name, expiryDays, fetchPats, t]);

  const latest = pats[0];
  const shortBoard =
    boardName ||
    (boardId ? `${boardId.slice(0, 8)}…` : t("mcp.thisBoard", "이 보드"));

  const features = [
    {
      icon: FileText,
      title: t("mcp.featSaveTitle", "이 보드에 문서 저장"),
      tool: "save_document",
      desc: t(
        "mcp.featSaveDesc",
        "AI가 만든 리포트·회의록·기획서를 이 보드 노트로 바로 저장.",
      ),
    },
    {
      icon: Share2,
      title: t("mcp.featShareTitle", "공유 링크 발급"),
      tool: "share_document",
      desc: t("mcp.featShareDesc", "로그인 없이 열람 가능한 링크로 팀에 공유."),
    },
    {
      icon: SquarePen,
      title: t("mcp.featEditTitle", "문서 조회·수정"),
      tool: "get / update_document",
      desc: t(
        "mcp.featEditDesc",
        "저장한 문서를 다시 불러오거나 이어서 고치기.",
      ),
    },
    {
      icon: LayoutGrid,
      title: t("mcp.featListTitle", "문서 목록·보드 선택"),
      tool: "list_documents / list_boards",
      desc: t(
        "mcp.featListDesc",
        "이 보드에 쌓인 문서를 훑거나, 저장할 다른 보드를 고르기.",
      ),
    },
  ];

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label={t("mcp.title", "MCP 연결")}
      className="sm:max-w-lg p-0 gap-0"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="w-9 h-9 rounded-xl bg-bridge-accent/15 text-bridge-accent flex items-center justify-center flex-none">
          <Link2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm md:text-base font-bold text-foreground leading-tight">
            {t("mcp.title", "MCP 연결")}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {t(
              "mcp.subtitle",
              "이 보드를 AI 어시스턴트에 연결 · Claude Code, Cursor 등 지원",
            )}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={t("common.close", "닫기")}
          className="ml-auto text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg p-1.5 transition-colors flex-none"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-foreground/[0.08]">
        {(["features", "connect"] as Tab[]).map((tk) => (
          <button
            key={tk}
            onClick={() => setTab(tk)}
            className={`relative px-3 pb-2.5 pt-1 text-xs md:text-sm font-medium transition-colors ${
              tab === tk
                ? "text-foreground"
                : "text-slate-400 hover:text-foreground"
            }`}
          >
            {tk === "features"
              ? t("mcp.tabFeatures", "사용 가능한 기능")
              : t("mcp.tabConnect", "연결 설명")}
            {tab === tk && (
              <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded bg-bridge-accent" />
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4">
        {tab === "features" ? (
          <div>
            <p className="text-xs md:text-sm text-slate-400 mb-4">
              {t(
                "mcp.featIntro",
                "연결하면 AI가 이 보드에 직접 다음을 할 수 있어요. (내 계정 권한으로 동작)",
              )}
            </p>
            <div className="divide-y divide-foreground/[0.06]">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.tool} className="flex items-start gap-3 py-3">
                    <div className="w-8 h-8 rounded-lg bg-bridge-secondary/15 text-bridge-secondary flex items-center justify-center flex-none">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-foreground">
                        {f.title}
                        <span className="ml-1.5 font-normal text-[11px] text-slate-500 font-mono">
                          {f.tool}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                {t("mcp.exampleLabel", "이렇게 말하면 돼요")}
              </div>
              <p className="text-sm text-foreground">
                <span className="text-bridge-accent">"</span>
                {t(
                  "mcp.exampleText",
                  "이번 스프린트 회고를 리포트로 정리해서 이 보드에 저장하고 공유 링크 줘",
                )}
                <span className="text-bridge-accent">"</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* 방식 토글 */}
            <div className="flex gap-1 bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl p-1">
              <button
                onClick={() => setMethod("oneCommand")}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                  method === "oneCommand"
                    ? "bg-bridge-accent text-white"
                    : "text-slate-400 hover:text-foreground"
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                {t("mcp.methodOneCommand", "원커맨드")}
                <span className="font-normal opacity-70">
                  {t("mcp.methodOneCommandHint", "빠름")}
                </span>
              </button>
              <button
                onClick={() => setMethod("plugin")}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                  method === "plugin"
                    ? "bg-bridge-accent text-white"
                    : "text-slate-400 hover:text-foreground"
                }`}
              >
                <Puzzle className="w-3.5 h-3.5" />
                {t("mcp.methodPlugin", "플러그인")}
                <span className="font-normal opacity-70">
                  {t("mcp.methodPluginHint", "보안")}
                </span>
              </button>
            </div>

            {/* ── 원커맨드: 값이 박힌 한 줄 ── */}
            {method === "oneCommand" && (
              <div>
                <p className="text-xs text-slate-400 mb-3">
                  {t(
                    "mcp.oneCmdIntro",
                    "명령 하나로 설치와 연결이 한 번에 끝나요. 토큰·보드 id가 이미 박혀 있어 프롬프트가 없습니다.",
                  )}
                </p>
                {created ? (
                  <>
                    <div className="flex items-start gap-2 rounded-lg bg-bridge-dark border border-foreground/10 px-3 py-2.5">
                      <pre className="flex-1 font-mono text-xs text-foreground whitespace-pre overflow-x-auto custom-scrollbar m-0">
                        {buildInstallCommand(
                          created.token,
                          BACKEND_ORIGIN,
                          boardId,
                        )}
                      </pre>
                      <CopyBtn
                        copied={copied === "onecmd"}
                        onClick={() =>
                          copy(
                            "onecmd",
                            buildInstallCommand(
                              created.token,
                              BACKEND_ORIGIN,
                              boardId,
                            ),
                          )
                        }
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      {t(
                        "mcp.oneCmdHint",
                        "터미널에 붙여넣고 Enter 한 번이면 끝.",
                      )}
                    </p>
                    <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-slate-400">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-none mt-0.5" />
                      <span>
                        <b className="text-amber-500 dark:text-amber-400">
                          {t(
                            "mcp.oneCmdSecStrong",
                            "토큰이 셸 히스토리에 남습니다.",
                          )}
                        </b>{" "}
                        {t(
                          "mcp.oneCmdSec",
                          "단기·폐기 가능 토큰을 권장해요. 다시 생성하면 새 토큰이 발급됩니다.",
                        )}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setCreated(null);
                        handleCreate();
                      }}
                      className="mt-2 text-[11px] text-slate-400 hover:text-foreground transition-colors"
                    >
                      {t("mcp.regen", "명령 다시 생성")}
                    </button>
                  </>
                ) : (
                  <>
                    {error && (
                      <p className="text-xs text-rose-400 mb-2">{error}</p>
                    )}
                    <button
                      onClick={handleCreate}
                      disabled={creating}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 disabled:opacity-50 transition-all"
                    >
                      {creating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                      {t("mcp.genCommand", "연결 명령 생성")}
                    </button>
                    <p className="text-[11px] text-slate-500 mt-2 text-center">
                      {t(
                        "mcp.genHint",
                        "새 액세스 토큰을 발급하고, 값이 박힌 설치 명령을 만들어요.",
                      )}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ── 플러그인: 단계별 ── */}
            {method === "plugin" && (
              <>
                {/* STEP 1 — 토큰 */}
                <ConnectStep
                  n={1}
                  title={t("mcp.step1Title", "내 액세스 토큰 (PAT)")}
                >
                  <p className="text-xs text-slate-400 mb-2.5">
                    {t(
                      "mcp.step1Desc",
                      "AI가 내 계정으로 접근할 키. 사람 단위라 이미 있으면 재사용합니다.",
                    )}
                  </p>

                  {created && (
                    <div className="mb-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-3">
                      <div className="flex items-start gap-2 text-xs text-foreground mb-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-none mt-0.5" />
                        <span>
                          <b className="text-amber-500 dark:text-amber-400">
                            {t("mcp.revealWarnStrong", "지금만 볼 수 있어요.")}
                          </b>{" "}
                          {t(
                            "mcp.revealWarn",
                            "창을 닫으면 다시 확인 불가. 안전한 곳에 복사하세요.",
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-bridge-dark border border-foreground/10 px-3 py-2">
                        <code className="flex-1 font-mono text-xs text-emerald-500 dark:text-emerald-400 break-all">
                          {created.token}
                        </code>
                        <CopyBtn
                          copied={copied === "token"}
                          onClick={() => copy("token", created.token)}
                        />
                      </div>
                    </div>
                  )}

                  {tokenMode === "status" ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08] px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0 text-xs">
                        {loading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                        ) : (
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-none ${
                              latest ? "bg-emerald-400" : "bg-slate-500"
                            }`}
                          />
                        )}
                        <span className="text-foreground truncate">
                          {latest
                            ? t("mcp.tokenIssued", "발급됨")
                            : t("mcp.tokenNone", "아직 없음")}
                          {latest && (
                            <span className="ml-1.5 font-mono text-slate-500">
                              {latest.token_prefix}…
                            </span>
                          )}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setCreated(null);
                          setTokenMode("form");
                        }}
                        className="flex-none inline-flex items-center gap-1 text-[11px] font-bold text-bridge-accent bg-bridge-accent/15 rounded-lg px-2.5 py-1.5 hover:bg-bridge-accent/25 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        {latest
                          ? t("mcp.tokenReissue", "새로 발급")
                          : t("mcp.tokenIssue", "발급")}
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3 flex flex-col gap-3">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                          {t("mcp.tokenName", "토큰 이름")}
                        </label>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={100}
                          className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg py-2 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                          {t("mcp.tokenExpiry", "만료")}
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {EXPIRY_OPTIONS.map((d) => (
                            <button
                              key={d}
                              onClick={() => setExpiryDays(d)}
                              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                                expiryDays === d
                                  ? "bg-bridge-accent/15 border-transparent text-bridge-accent font-bold"
                                  : "border-foreground/10 text-slate-400 hover:text-foreground"
                              }`}
                            >
                              {d === 0
                                ? t("mcp.expiryNone", "없음")
                                : `${d}${t("mcp.days", "일")}`}
                            </button>
                          ))}
                        </div>
                      </div>
                      {error && (
                        <p className="text-xs text-rose-400">{error}</p>
                      )}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setTokenMode("status")}
                          className="text-xs text-slate-400 hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-foreground/5 transition-colors"
                        >
                          {t("common.cancel", "취소")}
                        </button>
                        <button
                          onClick={handleCreate}
                          disabled={creating || !name.trim()}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg px-4 py-1.5 hover:bg-bridge-accent/90 disabled:opacity-50 transition-all"
                        >
                          {creating && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          )}
                          {t("mcp.issueBtn", "발급")}
                        </button>
                      </div>
                    </div>
                  )}
                </ConnectStep>

                {/* STEP 2 — 이 보드 연결값 */}
                <ConnectStep
                  n={2}
                  title={t("mcp.step2Title", "이 보드 연결값")}
                >
                  <p className="text-xs text-slate-400 mb-2.5">
                    {t(
                      "mcp.step2Desc",
                      "플러그인 설치 때 넣을 값. 보드 id는 이 보드로 이미 채워져 있어요.",
                    )}
                  </p>
                  <CopyRow
                    label={t("mcp.cfgBoardId", "기본 저장 보드 id ← 이 보드")}
                    value={boardId}
                    valueClass="text-bridge-secondary"
                    copied={copied === "board"}
                    onCopy={() => copy("board", boardId)}
                  />
                </ConnectStep>

                {/* STEP 3 — 설치 */}
                <ConnectStep
                  n={3}
                  title={t("mcp.step3Title", "플러그인 설치 · 붙여넣기")}
                >
                  <p className="text-xs text-slate-400 mb-2.5">
                    {t(
                      "mcp.step3Desc",
                      "Claude Code(또는 다른 MCP 클라이언트)에서 아래 실행 후, 프롬프트에 토큰과 보드 id를 입력.",
                    )}
                  </p>
                  <div className="flex items-start gap-2 rounded-lg bg-bridge-dark border border-foreground/10 px-3 py-2.5">
                    <pre className="flex-1 font-mono text-xs text-foreground whitespace-pre overflow-x-auto custom-scrollbar m-0">
                      {INSTALL_CMD}
                    </pre>
                    <CopyBtn
                      copied={copied === "cmd"}
                      onClick={() => copy("cmd", INSTALL_CMD)}
                    />
                  </div>
                </ConnectStep>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="inline-flex items-center gap-2 text-[11px] text-slate-500">
          {t("mcp.targetBoard", "연결 대상")}
          <span className="font-mono text-slate-400 bg-foreground/[0.04] border border-foreground/[0.08] px-2 py-0.5 rounded">
            {shortBoard}
          </span>
        </span>
        <span className="text-[11px] text-slate-600">Esc</span>
      </div>
    </MotionModal>
  );
}

/* ── 하위 프리젠테이션 컴포넌트 ── */

function ConnectStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-lg bg-bridge-accent text-white font-mono font-bold text-xs flex items-center justify-center flex-none mt-0.5">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-bold text-foreground mb-1.5">{title}</h4>
        {children}
      </div>
    </div>
  );
}

function CopyRow({
  label,
  value,
  valueClass = "",
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  valueClass?: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08] px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10px] text-slate-500">{label}</div>
        <div
          className={`font-mono text-xs break-all ${valueClass || "text-foreground"}`}
        >
          {value}
        </div>
      </div>
      <CopyBtn copied={copied} onClick={onCopy} />
    </div>
  );
}

function CopyBtn({
  copied,
  onClick,
}: {
  copied: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="flex-none inline-flex items-center gap-1 text-[11px] font-bold text-bridge-accent bg-bridge-accent/15 rounded-lg px-2.5 py-1.5 hover:bg-bridge-accent/25 transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? t("mcp.copied", "복사됨") : t("mcp.copy", "복사")}
    </button>
  );
}
