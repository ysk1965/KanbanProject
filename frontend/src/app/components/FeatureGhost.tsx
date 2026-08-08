import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import type { BoardUiConfig } from "../hooks/useBoardUiConfig";
import type { BoardUiLevel, BoardUiOption } from "../hooks/useBoardFeatures";

/**
 * 유령 슬롯 — 꺼진 기능을 **그 기능이 실제로 나타날 자리**에 점선으로 남긴다.
 *
 * 설계: `docs/Design/level-onboarding-plan.html`
 *
 * 설정 화면에 숨기지 않는 이유는 하나다: **위치가 곧 설명**이라서.
 * "단계로 묶기"를 탭 줄에서 보면 그게 탭이 된다는 걸 따로 안 알려줘도 안다.
 *
 * 광고판이 되지 않게 네 가지를 못 박는다.
 *  1. **동시 2개까지** — 셋 이상이면 화면이 제안 목록이 된다.
 *  2. **선행 조건** — 레벨 사다리는 건너뛸 수 없으므로 한 칸 위만 제안한다.
 *  3. **영구 해제** — "그만 보기"를 누르면 다시 안 뜨고 기능 서랍에만 남는다.
 *  4. **자리 있는 것만** — 실제 UI가 놓일 위치에만. 빈 곳에 띄우지 않는다.
 */

export type GhostKey = "level2" | "level3" | "members" | "review";

interface GhostSpec {
  key: GhostKey;
  /** 우선순위 — 낮을수록 먼저. 동시 2개 제한에 걸릴 때 순서를 정한다. */
  prio: number;
  label: string;
  title: string;
  desc: string;
  where: string;
}

const GHOSTS: GhostSpec[] = [
  {
    key: "level2",
    prio: 1,
    label: "주기로 관리",
    title: "주기 (스프린트)",
    desc: "이번 주기에 할 것만 골라 담고 종료일에 한 번씩 끊습니다. 못 끝낸 건 다음 주기로 넘어갑니다. 담는 순간 카드에 기간이 붙습니다.",
    where: "상단 헤더 · 왼쪽 레일",
  },
  {
    key: "level3",
    prio: 2,
    label: "단계로 묶기",
    title: "단계 (마일스톤)",
    desc: "지금까지 돌린 주기들을 하나의 상자로 묶습니다. 분기·런칭 단위로 계획할 때 씁니다. 주기는 그대로 굴러갑니다.",
    where: "상단 탭 줄",
  },
  {
    key: "members",
    prio: 3,
    label: "구성원별로 보기",
    title: "구성원별 보기",
    desc: "컬럼을 사람으로 세웁니다. 한 작업을 여러 명이 나눠 밀기 때문에 같은 카드가 여러 컬럼에 서고, 각 컬럼은 그 사람 몫만 셉니다.",
    where: "스프린트 헤더 오른쪽",
  },
  {
    key: "review",
    prio: 4,
    label: "리뷰 단계",
    title: "리뷰 (In Review)",
    desc: "끝내기 전에 누가 봐줘야 하는 일을 따로 세웁니다. 진행 → 리뷰 → 완료 세 칸이 됩니다.",
    where: "보드 컬럼 · 카드 호버 액션",
  },
];

const MUTED_KEY = "bridge:feature-ghost:muted";

function readMuted(boardId: string): Set<GhostKey> {
  try {
    const raw = localStorage.getItem(`${MUTED_KEY}:${boardId}`);
    return raw ? new Set(JSON.parse(raw) as GhostKey[]) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * 지금 띄울 유령 목록. 자리마다 따로 판단하면 동시 2개 제한이 깨지므로
 * 한 곳에서 계산해 내려보낸다.
 */
export function useFeatureGhosts(
  boardId: string | undefined,
  uiConfig: BoardUiConfig,
  enabled: boolean,
): { visible: Set<GhostKey>; mute: (key: GhostKey) => void } {
  const [muted, setMuted] = useState<Set<GhostKey>>(new Set());

  useEffect(() => {
    setMuted(boardId ? readMuted(boardId) : new Set());
  }, [boardId]);

  const mute = useCallback(
    (key: GhostKey) => {
      setMuted((prev) => {
        const next = new Set(prev).add(key);
        try {
          if (boardId) {
            localStorage.setItem(
              `${MUTED_KEY}:${boardId}`,
              JSON.stringify([...next]),
            );
          }
        } catch {
          /* 프라이빗 모드 등 저장 불가 시 이번 세션만 유지 */
        }
        return next;
      });
    },
    [boardId],
  );

  const visible = useMemo(() => {
    if (!enabled) return new Set<GhostKey>();
    const { features } = uiConfig;
    const offer = (key: GhostKey): boolean => {
      switch (key) {
        // 레벨은 사다리다 — 한 칸 위만 제안한다. 1에서 3을 권하면 건너뛸 수 없는 걸 권하는 셈이다.
        case "level2":
          return features.level === 1;
        case "level3":
          return features.level === 2;
        case "members":
          return !features.has("members");
        case "review":
          return !features.has("review");
      }
    };
    return new Set(
      GHOSTS.filter((g) => !muted.has(g.key) && offer(g.key))
        .sort((a, b) => a.prio - b.prio)
        .slice(0, 2)
        .map((g) => g.key),
    );
  }, [enabled, uiConfig, muted]);

  return { visible, mute };
}

interface FeatureGhostProps {
  ghost: GhostKey;
  visible: Set<GhostKey>;
  uiConfig: BoardUiConfig;
  onMute: (key: GhostKey) => void;
  /** 팝오버가 왼쪽으로 열려야 하는 자리(화면 오른쪽 끝)에서 true. */
  alignRight?: boolean;
  /**
   * `chip`(기본) — 점선 칩 + 팝오버. 툴바·헤더처럼 자리가 좁을 때.
   * `column` — 설명을 인라인으로 펼친 컬럼 한 칸. 보드 컬럼 줄은
   *   `overflow-x-auto`가 y축까지 잘라내 팝오버가 못 뜨므로, 컬럼 자체를 설명 공간으로 쓴다.
   */
  variant?: "chip" | "column";
  className?: string;
}

export function FeatureGhost({
  ghost,
  visible,
  uiConfig,
  onMute,
  alignRight = false,
  variant = "chip",
  className = "",
}: FeatureGhostProps) {
  const [open, setOpen] = useState(false);
  const spec = GHOSTS.find((g) => g.key === ghost);

  // 켜지거나 음소거되면 목록에서 빠지고, 열려 있던 팝오버도 함께 닫힌다.
  const shown = visible.has(ghost);
  useEffect(() => {
    if (!shown) setOpen(false);
  }, [shown]);

  if (!spec || !shown) return null;

  const busy =
    uiConfig.pending ===
    (ghost === "level2"
      ? "level-2"
      : ghost === "level3"
        ? "level-3"
        : `opt-${ghost as BoardUiOption}`);

  const enable = () => {
    if (ghost === "level2" || ghost === "level3") {
      uiConfig.setLevel((ghost === "level2" ? 2 : 3) as BoardUiLevel);
    } else {
      uiConfig.enableOption(ghost as BoardUiOption);
    }
    setOpen(false);
  };

  if (variant === "column") {
    return (
      <div
        className={`w-[200px] shrink-0 flex flex-col rounded-2xl border border-dashed border-foreground/20 bg-foreground/[0.02] overflow-hidden ${className}`}
      >
        <div className="h-[3px] shrink-0 bg-foreground/10" />
        <div className="px-3 py-2.5 border-b border-foreground/[0.06] flex items-center gap-2">
          <Plus className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="text-xs font-bold text-slate-500 truncate">
            {spec.label}
          </span>
        </div>
        <div className="flex-1 p-3 flex flex-col gap-2.5 min-h-[120px]">
          <p className="text-xs text-slate-500 leading-relaxed m-0">
            {spec.desc}
          </p>
          <div className="mt-auto flex flex-col gap-1.5">
            <button
              type="button"
              onClick={enable}
              disabled={!!uiConfig.pending}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              켜기
            </button>
            <button
              type="button"
              onClick={() => onMute(ghost)}
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 rounded py-0.5"
            >
              그만 보기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed text-xs font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
          open
            ? "border-bridge-accent border-solid bg-bridge-accent/10 text-bridge-accent"
            : "border-foreground/20 text-slate-500 hover:border-bridge-accent hover:text-bridge-accent hover:bg-bridge-accent/[0.07]"
        }`}
        title={`${spec.title} — 아직 안 쓰고 있습니다`}
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Plus className="w-3 h-3" />
        )}
        {spec.label}
      </button>

      {open && (
        <>
          {/* 바깥 클릭으로 닫기 — 팝오버가 여러 개 열려 겹치지 않게 한다. */}
          <span
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <span
            role="dialog"
            aria-label={spec.title}
            className={`absolute top-[calc(100%+8px)] z-50 w-[264px] bg-bridge-obsidian border border-bridge-accent rounded-2xl shadow-2xl p-4 text-left grid gap-2 ${
              alignRight ? "right-0" : "left-0"
            }`}
          >
            <span className="text-sm font-bold text-foreground">
              {spec.title}
            </span>
            <span className="text-xs text-slate-400 leading-relaxed">
              {spec.desc}
            </span>
            <span className="text-xs text-bridge-secondary">
              나타나는 자리 · {spec.where}
            </span>
            <span className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={enable}
                disabled={!!uiConfig.pending}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              >
                켜기
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 border border-foreground/10 hover:bg-foreground/5 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              >
                나중에
              </button>
              {/* 거절을 기억하지 않는 UI는 거절을 물은 게 아니다. */}
              <button
                type="button"
                onClick={() => {
                  onMute(ghost);
                  setOpen(false);
                }}
                className="ml-auto text-xs text-slate-600 hover:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 rounded"
              >
                그만 보기
              </button>
            </span>
          </span>
        </>
      )}
    </span>
  );
}
