import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Eye, Undo2 } from "lucide-react";
import { getAssigneeHex, getInitials } from "../../utils/assigneeColor";
import type { BoardMember as ShareBoardMember } from "../ShareBoardModal";

/** 검색창을 띄우기 시작하는 멤버 수 */
const SEARCH_THRESHOLD = 4;
/** 최근 본 멤버 보관 개수 */
const RECENT_LIMIT = 3;

const recentsKey = (boardId: string) =>
  `bridge:dashboardScopeRecents:${boardId}`;

function readRecents(boardId: string): string[] {
  try {
    const raw = localStorage.getItem(recentsKey(boardId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecents(boardId: string, userId: string) {
  try {
    const next = [
      userId,
      ...readRecents(boardId).filter((v) => v !== userId),
    ].slice(0, RECENT_LIMIT);
    localStorage.setItem(recentsKey(boardId), JSON.stringify(next));
  } catch {
    // 저장 실패는 기능에 영향 없다 — 최근 목록만 비어 보인다
  }
}

interface DashboardScopeRowProps {
  boardId: string;
  /** 뷰어를 제외한 선택 가능한 멤버 (보드 순서 그대로) */
  members: ShareBoardMember[];
  /** 로그인한 사용자 */
  myUserId: string | undefined;
  /** 지금 보고 있는 대상 */
  scopeUserId: string | undefined;
  onChange: (userId: string) => void;
}

/**
 * 대시보드 스코프 행 — 서브탭과 대시보드 콘텐츠 사이의 한 줄.
 *
 * 내 대시보드일 때는 칩만 놓인 조용한 줄이고, 다른 멤버를 보는 순간
 * 줄 전체가 강조색으로 물들며 "읽기 전용 · 내 대시보드로"를 품는다.
 * 두 상태의 높이는 같다 — 전환할 때 아래 콘텐츠가 밀리면 화면이 흔들린 것처럼 읽힌다.
 */
export function DashboardScopeRow({
  boardId,
  members,
  myUserId,
  scopeUserId,
  onChange,
}: DashboardScopeRowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isOtherScope = !!scopeUserId && scopeUserId !== myUserId;
  const current = useMemo(
    () => members.find((m) => m.userId === scopeUserId),
    [members, scopeUserId],
  );

  // 검색어로 거른 뒤 "나 → 최근 → 직군 그룹" 순으로 배열한다.
  // flat 목록은 키보드 이동용, sections는 렌더용으로 같은 순서를 공유한다.
  const { sections, flat } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? members.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.email.toLowerCase().includes(q),
        )
      : members;

    const me = matched.filter((m) => m.userId === myUserId);
    const rest = matched.filter((m) => m.userId !== myUserId);

    const recentIds = readRecents(boardId);
    const recent = recentIds
      .map((id) => rest.find((m) => m.userId === id))
      .filter((m): m is ShareBoardMember => !!m);
    const recentSet = new Set(recent.map((m) => m.userId));
    const others = rest.filter((m) => !recentSet.has(m.userId));

    // 직군별로 묶고, 직군 없는 멤버는 마지막에 모은다
    const byRole = new Map<string, ShareBoardMember[]>();
    const noRole: ShareBoardMember[] = [];
    others.forEach((m) => {
      const label = m.jobRole?.name;
      if (!label) {
        noRole.push(m);
        return;
      }
      const bucket = byRole.get(label);
      if (bucket) bucket.push(m);
      else byRole.set(label, [m]);
    });

    const built: { title: string | null; items: ShareBoardMember[] }[] = [];
    if (me.length) built.push({ title: null, items: me });
    if (recent.length)
      built.push({
        title: t("boardDashboard.scopeRecent", "최근 본 멤버"),
        items: recent,
      });
    byRole.forEach((items, label) => built.push({ title: label, items }));
    if (noRole.length)
      built.push({
        title: byRole.size
          ? t("boardDashboard.scopeOtherMembers", "그 외")
          : t("boardDashboard.scopeAllMembers", "전체"),
        items: noRole,
      });

    return { sections: built, flat: built.flatMap((s) => s.items) };
    // open을 넣어 둔다 — 최근 목록은 localStorage에서 읽으므로 열 때마다 다시 계산해야 한다
  }, [members, myUserId, boardId, query, t, open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }, []);

  const select = useCallback(
    (userId: string) => {
      if (userId !== myUserId) writeRecents(boardId, userId);
      onChange(userId);
      setOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    },
    [boardId, myUserId, onChange],
  );

  // 열릴 때마다 현재 선택 항목을 활성 행으로 맞춘다
  useEffect(() => {
    if (!open) return;
    const idx = flat.findIndex((m) => m.userId === scopeUserId);
    setActiveIndex(idx >= 0 ? idx : 0);
    if (members.length >= SEARCH_THRESHOLD) {
      // 렌더 직후 포커스 — 열자마자 타이핑할 수 있게
      const id = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open, flat, scopeUserId, members.length]);

  // 검색어가 바뀌면 첫 항목으로
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 바깥 클릭으로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!flat.length) return;
        const delta = e.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((prev) => (prev + delta + flat.length) % flat.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const target = flat[activeIndex];
        if (target) select(target.userId);
      }
    },
    [open, flat, activeIndex, close, select],
  );

  const label = current?.name ?? t("boardDashboard.scopeUnknown", "멤버 선택");
  const isMe = !!current && current.userId === myUserId;

  return (
    <div
      ref={rootRef}
      onKeyDown={handleKeyDown}
      className={`relative flex-none flex items-center gap-2 h-[38px] mx-3 md:mx-5 mb-2 px-2 rounded-xl transition-colors ${
        isOtherScope
          ? "bg-bridge-accent/15 border border-bridge-accent"
          : "border border-transparent"
      }`}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-foreground/[0.06] border border-foreground/10
          hover:bg-foreground/10 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-colors"
      >
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{
            backgroundColor: getAssigneeHex(label, current?.assigneeColor),
          }}
          aria-hidden="true"
        >
          {getInitials(label)}
        </span>
        <span className="text-xs font-normal text-slate-400">
          {t("boardDashboard.scopePrefix", "대시보드")}
        </span>
        <span className="text-xs text-slate-500" aria-hidden="true">
          ·
        </span>
        <span className="text-xs font-bold text-foreground">
          {isMe
            ? t("boardDashboard.scopeMe", "{{name}} (나)", { name: label })
            : label}
        </span>
        <ChevronDown size={12} className="text-slate-400" aria-hidden="true" />
      </button>

      {isOtherScope && (
        <>
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Eye size={12} aria-hidden="true" />
            {t("boardDashboard.scopeReadOnly", "읽기 전용")}
          </span>
          <button
            type="button"
            onClick={() => myUserId && select(myUserId)}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-bridge-accent
              hover:bg-bridge-accent/10 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-colors"
          >
            <Undo2 size={12} aria-hidden="true" />
            {t("boardDashboard.scopeBackToMine", "내 대시보드로")}
          </button>
        </>
      )}

      {open && (
        <div
          className="absolute left-0 top-[42px] z-30 w-60 p-1.5 rounded-xl bg-bridge-obsidian
            border border-foreground/10 shadow-2xl"
        >
          {members.length >= SEARCH_THRESHOLD && (
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("boardDashboard.scopeSearch", "멤버 검색")}
              aria-label={t("boardDashboard.scopeSearch", "멤버 검색")}
              className="w-full mb-1 bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1.5 px-2.5
                text-xs text-foreground placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
          )}

          <div
            role="listbox"
            aria-label={t(
              "boardDashboard.scopeListLabel",
              "대시보드를 볼 멤버",
            )}
            className="max-h-64 overflow-y-auto custom-scrollbar"
          >
            {flat.length === 0 ? (
              <p className="px-2 py-3 text-xs text-slate-500">
                {t("boardDashboard.scopeNoMatch", "일치하는 멤버가 없습니다.")}
              </p>
            ) : (
              sections.map((section, si) => (
                <div key={section.title ?? `s-${si}`}>
                  {section.title && (
                    <p className="px-2 pt-2 pb-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                      {section.title}
                    </p>
                  )}
                  {section.items.map((m) => {
                    const index = flat.indexOf(m);
                    const selected = m.userId === scopeUserId;
                    const active = index === activeIndex;
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => select(m.userId)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                          selected
                            ? "bg-bridge-accent/15"
                            : active
                              ? "bg-foreground/5"
                              : ""
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-none"
                          style={{
                            backgroundColor: getAssigneeHex(
                              m.name,
                              m.assigneeColor,
                            ),
                          }}
                          aria-hidden="true"
                        >
                          {getInitials(m.name)}
                        </span>
                        <span
                          className={`text-xs truncate ${
                            selected
                              ? "font-bold text-foreground"
                              : "font-normal text-slate-400"
                          }`}
                        >
                          {m.userId === myUserId
                            ? t("boardDashboard.scopeMe", "{{name}} (나)", {
                                name: m.name,
                              })
                            : m.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

DashboardScopeRow.displayName = "DashboardScopeRow";
