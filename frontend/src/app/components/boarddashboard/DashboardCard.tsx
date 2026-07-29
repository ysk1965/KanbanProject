import { ReactNode } from "react";
import { Loader2, ExternalLink } from "lucide-react";

interface DashboardCardProps {
  title: string;
  /** 제목 옆 회색 보조 문구 (기간, 날짜 등) */
  subtitle?: ReactNode;
  /** 헤더 우측 — 더 큰 화면으로 가는 링크. 모든 위젯이 같은 자리를 쓴다. */
  linkLabel?: string;
  onLinkClick?: () => void;
  /** 헤더 우측, 링크 앞에 놓이는 요소 (세그먼트 등) */
  headerExtra?: ReactNode;
  isLoading?: boolean;
  /** 본문 패딩 없이 직접 그리는 위젯(타임블록·보드)은 false */
  padded?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * 보드 대시보드 위젯 공통 셸.
 * 헤더 우측은 "더 큰 화면으로 가는 링크" 자리로 고정한다 — 위젯마다 다른 액션 버튼을 두지 않는다.
 */
export function DashboardCard({
  title,
  subtitle,
  linkLabel,
  onLinkClick,
  headerExtra,
  isLoading = false,
  padded = true,
  className = "",
  children,
}: DashboardCardProps) {
  return (
    <section
      className={`bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden ${className}`}
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-foreground/[0.08]">
        <h2 className="text-xs md:text-sm font-bold text-foreground">
          {title}
        </h2>
        {subtitle && (
          <span className="text-xs text-slate-500 truncate">{subtitle}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
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
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2
            className="w-6 h-6 animate-spin text-bridge-accent"
            aria-label="불러오는 중"
          />
        </div>
      ) : (
        <div className={padded ? "p-4" : ""}>{children}</div>
      )}
    </section>
  );
}

/** 위젯 내부 빈 상태 — 숨기지 않고 다음 행동을 제시한다. */
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
