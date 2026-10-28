import { useEffect, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';

export interface ViewBarItem {
  key: string;
  label: string;
  count?: string | number;
  on: boolean;
  go: () => void;
}

interface Props {
  /** 지금 탭 — 고른 보기 칩이 이 탭 색을 쓴다 */
  k: string;
  items: ViewBarItem[];
  /** 지금 탭이 하단 바 몇 번째인지 — 접힌 이름표를 어느 쪽에 붙일지 */
  index: number;
  count: number;
  collapsed: boolean;
  onExpand: () => void;
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
  /** 찾기 칸을 다른 곳(성경 읽기)이 그린다 — 🔍 는 열기만 하고, 열리면 줄 자리를 host 로 내준다 */
  dock?: { open: boolean; onOpen: () => void; onHost: (el: HTMLElement | null) => void };
  action?: { label: string; onClick: () => void };
  /** 줄 바로 위 선반 — 성경 구절 목록이 66칸 한 줄(BookStrip)을 여기에 그린다 */
  shelf?: (el: HTMLElement | null) => void;
}

/**
 * 좁은 화면(설치 앱) 「자리 맞춤 줄」 — 하단 바 바로 위에 떠서 그 탭의 보기 칩을 모은다.
 * 줄 아래쪽이 동그라미 자리만큼 패이고(--sn-orb-x 는 SermonBottomNav 가 매 프레임 넣는다),
 * 본문을 아래로 내리면 고른 보기 이름표만 남기고 접힌다.
 */
export function SnViewBar({
  k,
  items,
  index,
  count,
  collapsed,
  onExpand,
  search,
  action,
  dock,
  shelf,
}: Props) {
  const [searching, setSearching] = useState(() => !!search?.value);
  const inputRef = useRef<HTMLInputElement>(null);
  const cur = items.find((it) => it.on);
  const side = index < (count - 1) / 2 ? 'l' : index > (count - 1) / 2 ? 'r' : 'c';

  // 검색이 없는 보기로 가면 검색칸을 닫는다
  useEffect(() => {
    if (!search) setSearching(false);
  }, [search]);
  useEffect(() => {
    if (searching) inputRef.current?.focus();
  }, [searching]);

  const closeSearch = () => {
    search?.onChange('');
    setSearching(false);
  };

  return (
    <div
      className="sn-vbar-wrap"
      data-k={k}
      data-min={collapsed}
      data-side={side}
      data-dock={dock?.open || undefined}
      data-many={items.length >= 4 || undefined}
    >
      {shelf && <div className="sn-vbar-shelf" ref={shelf} aria-hidden={collapsed || undefined} />}
      {dock?.open && <div className="sn-vbar-dock" ref={dock.onHost} />}
      <div className="sn-vbar" aria-hidden={collapsed || undefined}>
        {searching && search ? (
          <>
            <Search className="sn-vbar-sic" aria-hidden />
            <input
              ref={inputRef}
              id="sn-vq"
              type="search"
              aria-label="검색"
              placeholder={search.placeholder}
              autoComplete="off"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeSearch();
              }}
            />
            <button type="button" className="sn-vbar-cancel" onClick={closeSearch}>
              취소
            </button>
          </>
        ) : (
          <>
            {(search || dock) && (
              <button
                type="button"
                className="sn-vbar-rd"
                aria-label={dock ? '말씀 찾기' : '검색'}
                tabIndex={collapsed ? -1 : undefined}
                onClick={() => (dock ? dock.onOpen() : setSearching(true))}
              >
                <Search aria-hidden />
              </button>
            )}
            <div className="sn-vbar-chips" role="group" aria-label="보기">
              {items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  aria-pressed={it.on}
                  tabIndex={collapsed ? -1 : undefined}
                  onClick={it.go}
                >
                  {it.label}
                  {it.count !== undefined && it.count !== '' && (
                    <span className="sn-count">{it.count}</span>
                  )}
                </button>
              ))}
            </div>
            {action && (
              <button
                type="button"
                className="sn-vbar-rd sn-vbar-go"
                aria-label={action.label}
                tabIndex={collapsed ? -1 : undefined}
                onClick={action.onClick}
              >
                <Plus aria-hidden />
              </button>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        className="sn-vbar-tag"
        aria-label={`보기 펼치기${cur ? ` · ${cur.label}` : ''}`}
        tabIndex={collapsed ? undefined : -1}
        onClick={onExpand}
      >
        {searching && search?.value ? `‘${search.value}’` : cur?.label || '보기'}
        <span aria-hidden>▴</span>
      </button>
    </div>
  );
}
