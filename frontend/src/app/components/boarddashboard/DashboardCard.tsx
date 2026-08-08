import type { HTMLAttributes, ReactNode, Ref } from "react";
import { Loader2, ExternalLink } from "lucide-react";

/**
 * 보드 대시보드의 네 패널이 공유하는 단 하나의 셸.
 *
 * 통일감이 깨지던 자리는 색이나 활자가 아니라 "이것이 한 패널의 머리다"라고 말하는
 * 방식이었다 — 어떤 패널은 제목 한 줄, 어떤 패널은 탭 스트립, 백로그는 거기에
 * 배경 틴트까지 얹혀 있었다. 그래서 넷이 동등한 카드로 안 읽혔다.
 *
 * 규칙은 셋뿐이다.
 *   1. 머리는 h-10 한 줄. 탭이 들어와도 높이가 변하지 않는다.
 *   2. 좌우 여백은 본문 행까지 px-3.5로 같다 — 제목과 행 텍스트가 한 선에서 시작한다.
 *   3. 머리 오른쪽 끝은 "더 큰 화면으로 가는 링크" 자리다. ml-auto는 그 묶음에만 한 번.
 */

/** 패널 머리 높이 (h-10) — 큐 스택이 백로그를 접을 때 이 값만큼 남긴다 */
export const PANEL_HEADER_HEIGHT = 40;

/** 머리와 본문 행이 함께 쓰는 좌우 여백 */
export const PANEL_PAD_X = "px-3.5";

/**
 * 단계 표식 — 대시보드는 성숙도 순으로 쌓여 있다.
 * 백로그(slate) → 배치 대기(amber, 지연 탭은 rose) → 워크로드(indigo) → 타임블록(teal).
 *
 * 단계는 6px 도트 하나로만 말한다. 배경 틴트는 드래그 상태 전용으로 비워 둔다 —
 * 상시 정체성과 일시적 상태가 같은 색을 나눠 쓰면 둘 다 안 읽힌다.
 */
export type PanelDot = "teal" | "accent" | "amber" | "rose" | "slate";

const DOT_CLASS: Record<PanelDot, string> = {
  teal: "bg-bridge-secondary",
  accent: "bg-bridge-accent",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-500",
};

/** 머리 안 탭 버튼 — 배치 대기·백로그가 같은 모양을 쓴다 */
export function panelTabClass(active: boolean): string {
  return `flex-none flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
    active
      ? "bg-foreground/[0.08] text-foreground"
      : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
  }`;
}

type CountTone = "muted" | "rose" | "amber" | "accent" | "teal";

const COUNT_TONE: Record<CountTone, string> = {
  muted: "bg-foreground/[0.06] text-slate-500",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  accent: "bg-bridge-accent/15 text-bridge-accent",
  teal: "bg-bridge-secondary/15 text-bridge-secondary",
};

/**
 * 개수 하나짜리 알약. 탭 안 숫자·"오늘 N"·백로그 개수가 전부 이 하나를 쓴다 —
 * 숫자가 어디에 있든 같은 물건으로 읽혀야 한다.
 */
export function PanelCount({
  value,
  tone = "muted",
}: {
  value: number;
  tone?: CountTone;
}) {
  return (
    <span
      className={`flex-none text-xs font-bold px-1.5 rounded-full tabular-nums ${COUNT_TONE[tone]}`}
    >
      {value}
    </span>
  );
}

interface PanelShellProps {
  /** 단계 표식 도트 — 없으면 안 그린다 */
  dot?: PanelDot;
  title: string;
  /** 제목 옆 회색 보조 문구 (기간, 날짜, 보고 있는 사람 등) */
  subtitle?: ReactNode;
  /** 제목 오른쪽에 붙는 세그먼트 — 탭 묶음 등 */
  tabs?: ReactNode;
  /** 머리 오른쪽, 링크 앞에 놓이는 요소 (필터 알약 등) */
  headerExtra?: ReactNode;
  /** 머리 오른쪽 — 더 큰 화면으로 가는 링크. 네 패널이 같은 자리를 쓴다. */
  linkLabel?: string;
  onLinkClick?: () => void;
  /** 머리 오른쪽 맨 끝 — 접기 같은 아이콘 버튼 */
  headerTrailing?: ReactNode;
  /** 머리 바로 아래 고정 — 되돌리기·오류 배너. 네 패널 모두 같은 자리다. */
  banner?: ReactNode;
  /** 본문 아래 고정 한 줄 — 드래그 힌트 등 */
  footer?: ReactNode;
  isLoading?: boolean;
  /** 본문 패딩 없이 직접 그리는 패널(타임블록·간트·목록)은 false */
  padded?: boolean;
  className?: string;
  bodyClassName?: string;
  /**
   * 드롭 상태 틴트 — 카드 위를 덮는 레이어의 클래스.
   *
   * 배경을 className으로 얹지 않는 이유: bg-bridge-obsidian과 bg-bridge-accent/[N]은
   * 같은 속성을 다투므로 어느 쪽이 이길지는 클래스 문자열 순서가 아니라 컴파일된
   * CSS 순서가 정한다. 덮는 층으로 올리면 순서에 기대지 않고, 틴트가 카드 바탕색
   * 위에 겹쳐지던 원래 색도 그대로 나온다. (pointer-events-none이라 드롭은 막지 않는다)
   */
  overlayClassName?: string;
  /** 드롭 존 속성 등 섹션에 그대로 펼칠 것 (className은 따로 받는다) */
  sectionProps?: HTMLAttributes<HTMLElement>;
  /**
   * 카드 바깥 노드를 잡는 ref — 손잡이가 드래그 중에 이 노드의 height를 직접 쓴다.
   * (매 프레임 setState하면 간트가 통째로 다시 그려지므로 DOM만 만진다)
   */
  sectionRef?: Ref<HTMLElement>;
  children: ReactNode;
}

export function PanelShell({
  dot,
  title,
  subtitle,
  tabs,
  headerExtra,
  linkLabel,
  onLinkClick,
  headerTrailing,
  banner,
  footer,
  isLoading = false,
  padded = true,
  className = "",
  bodyClassName = "",
  overlayClassName,
  sectionProps,
  sectionRef,
  children,
}: PanelShellProps) {
  return (
    <section
      {...sectionProps}
      ref={sectionRef}
      className={`relative bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden flex flex-col min-h-0 ${className}`}
    >
      <header
        className={`flex-none h-10 flex items-center gap-2 ${PANEL_PAD_X} border-b border-foreground/[0.08]`}
      >
        {dot && (
          <span
            className={`flex-none w-1.5 h-1.5 rounded-full ${DOT_CLASS[dot]}`}
            aria-hidden="true"
          />
        )}
        {/* min-w-0 — flex 안에서 truncate가 실제로 먹으려면 줄어들 수 있어야 한다 */}
        <h2 className="min-w-0 text-xs md:text-sm font-bold text-foreground truncate">
          {title}
        </h2>
        {subtitle && (
          <span className="hidden sm:block min-w-0 text-xs text-slate-500 truncate">
            {subtitle}
          </span>
        )}
        {tabs}
        {/* ml-auto는 여기 한 번뿐이다 — 링크가 네 패널에서 같은 x좌표에 선다 */}
        <div className="ml-auto flex-none flex items-center gap-2 pl-2">
          {headerExtra}
          {linkLabel && onLinkClick && (
            <button
              type="button"
              onClick={onLinkClick}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-foreground transition-colors"
            >
              {linkLabel}
              <ExternalLink size={12} aria-hidden="true" />
            </button>
          )}
          {headerTrailing}
        </div>
      </header>

      {banner}

      {isLoading ? (
        <div className="flex-1 min-h-0 flex items-center justify-center py-12">
          <Loader2
            className="w-6 h-6 animate-spin text-bridge-accent"
            aria-label="불러오는 중"
          />
        </div>
      ) : (
        <div
          className={`flex-1 min-h-0 ${padded ? "p-3.5" : ""} ${bodyClassName}`}
        >
          {children}
        </div>
      )}

      {footer}

      {overlayClassName && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-2xl transition-colors ${overlayClassName}`}
        />
      )}
    </section>
  );
}

/**
 * 머리 바로 아래 붙는 배너 — 되돌리기 안내와 오류가 같은 자리, 같은 모양을 쓴다.
 * 워크로드는 배치·해제를, 백로그는 강등을 알리지만 사용자에게는 같은 사건이다.
 */
export function PanelBanner({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error";
}) {
  return (
    <div
      role="status"
      className={`flex-none flex items-center gap-2 ${PANEL_PAD_X} py-1.5 border-b border-foreground/[0.08] bg-foreground/[0.03] ${
        tone === "error" ? "text-rose-600 dark:text-rose-400" : "text-slate-400"
      }`}
    >
      {children}
    </div>
  );
}

/** 본문 아래 고정 한 줄 — 드래그 힌트처럼 "여기서 무엇을 할 수 있나"를 놓는 자리 */
export function PanelFooterHint({
  children,
  emphasized = false,
}: {
  children: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <p
      className={`flex-none ${PANEL_PAD_X} py-1 border-t border-foreground/[0.06] text-xs truncate ${
        emphasized ? "font-bold text-bridge-accent" : "text-slate-600"
      }`}
    >
      {children}
    </p>
  );
}

/** 패널 내부 빈 상태 — 숨기지 않고 다음 행동을 제시한다. */
export function DashboardEmpty({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="text-xs text-slate-500">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="text-xs font-bold text-bridge-accent hover:underline"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
