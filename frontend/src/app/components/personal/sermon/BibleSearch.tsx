import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, Search, X } from 'lucide-react';
import { BOOKS, refShort } from './bibleRefs';
import {
  groupByBook,
  searchBible,
  searchOptions,
  searchTerms,
  splitTerms,
  type SearchOption,
  type SearchScope,
} from './verseSearch';
import type { BibleData } from './useBible';
import './bibleSearch.css';

/**
 * 성경 읽기 「말씀 찾기」 칸 — 넓은 화면은 조작부 줄 오른쪽 입력칸, 좁은 화면은 🔍 버튼 → 조작부 아래로 펼친 칸.
 * 주소(마4:1 · 롬 8)는 고르면 그 자리로, 낱말(믿음 소망)은 Enter 로 결과 화면(BibleSearchResults).
 * 넓은 화면에서는 「/」 로 칸에 들어간다.
 */
interface BibleSearchProps {
  narrow: boolean;
  onGo: (b: number, c: number, v: number | null) => void;
  onWord: (q: string) => void;
  /** 설치 앱 하단 보기 줄 안에 칸을 바로 펼친다 — 후보 목록은 줄 위로 열린다 */
  dock?: { onClose: () => void };
}

export function BibleSearch({ narrow, onGo, onWord, dock }: BibleSearchProps) {
  const [q, setQ] = useState('');
  const [drop, setDrop] = useState(false);
  const [sel, setSel] = useState(0);
  const [panel, setPanel] = useState(!!dock);
  // 하단 줄(dock) 칸은 닫히면 줄 자리를 돌려준다
  const onCloseRef = useRef(dock?.onClose);
  useEffect(() => {
    onCloseRef.current = dock?.onClose;
  });
  useEffect(() => {
    if (!panel) onCloseRef.current?.();
  }, [panel]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const opts = useMemo(() => searchOptions(q), [q]);
  const showList = drop && opts.length > 0;

  // 넓은 화면 — 「/」 로 칸에 들어간다 (입력 중인 곳에서는 무시)
  useEffect(() => {
    if (narrow) return;
    const on = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [narrow]);

  // 바깥을 누르면 목록(좁은 화면은 칸까지) 닫기
  useEffect(() => {
    if (!drop && !panel) return;
    const on = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setDrop(false);
      setPanel(false);
    };
    document.addEventListener('pointerdown', on);
    return () => document.removeEventListener('pointerdown', on);
  }, [drop, panel]);

  useEffect(() => {
    if (panel) inputRef.current?.focus();
  }, [panel]);

  const choose = (o: SearchOption | undefined) => {
    if (!o) return;
    setDrop(false);
    setPanel(false);
    inputRef.current?.blur();
    if (o.kind === 'word') {
      onWord(o.q);
      return;
    }
    setQ('');
    onGo(o.b, o.c, o.v);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDrop(true);
      setSel((s) => Math.min(opts.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(opts[sel] || opts[0]);
    } else if (e.key === 'Escape') {
      if (drop) setDrop(false);
      else {
        setPanel(false);
        inputRef.current?.blur();
      }
    }
  };

  const box = (
    <div className="sn-bsearch-box">
      <Search className="sn-icon" aria-hidden />
      <input
        ref={inputRef}
        id="sn-bible-q"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="구절이나 단어 찾기"
        aria-label="구절이나 단어 찾기 (예: 마4:1, 믿음 소망)"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList ? `${listId}-${sel}` : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
          setDrop(true);
        }}
        onFocus={() => q && setDrop(true)}
        onKeyDown={onKey}
      />
      {q ? (
        <button
          type="button"
          className="sn-bsearch-clear"
          aria-label="지우기"
          onClick={() => {
            setQ('');
            inputRef.current?.focus();
          }}
        >
          <X aria-hidden />
        </button>
      ) : (
        !narrow && (
          <kbd className="sn-bsearch-kbd" aria-hidden>
            /
          </kbd>
        )
      )}
    </div>
  );

  const list = showList && (
    <div className="sn-bsearch-list" role="listbox" id={listId} aria-label="찾기 후보">
      {opts.map((o, i) => (
        <button
          key={`${o.kind}-${o.label}`}
          id={`${listId}-${i}`}
          type="button"
          role="option"
          aria-selected={i === sel}
          className="sn-bsearch-opt"
          data-kind={o.kind}
          onPointerEnter={() => setSel(i)}
          onClick={() => choose(o)}
        >
          {o.kind === 'word' && <Search className="sn-icon" aria-hidden />}
          <b>{o.label}</b>
          {o.sub && <span>{o.sub}</span>}
        </button>
      ))}
    </div>
  );

  if (dock) {
    return (
      <div className="sn-bsearch-dock" ref={wrapRef}>
        {(list || !q) && (
          <div className="sn-bsearch-up">
            {list}
            {!q && (
              <p className="sn-bsearch-tip">마4:1 · 롬 8 처럼 주소를, 믿음 소망 처럼 낱말을</p>
            )}
          </div>
        )}
        <div className="sn-bsearch-row">
          {box}
          <button type="button" className="sn-bsearch-cancel" onClick={() => setPanel(false)}>
            취소
          </button>
        </div>
      </div>
    );
  }
  if (!narrow) {
    return (
      <div className="sn-bsearch" ref={wrapRef}>
        {box}
        {list}
      </div>
    );
  }
  return (
    <div className="sn-bsearch-narrow" ref={wrapRef}>
      <button
        type="button"
        className="sn-bible-step"
        aria-label="말씀 찾기"
        aria-expanded={panel}
        onClick={() => setPanel((p) => !p)}
      >
        <Search className="sn-icon" aria-hidden />
      </button>
      {panel && (
        <div className="sn-bsearch-panel">
          <div className="sn-bsearch-row">
            {box}
            <button type="button" className="sn-bsearch-cancel" onClick={() => setPanel(false)}>
              취소
            </button>
          </div>
          {list}
          {!q && <p className="sn-bsearch-tip">마4:1 · 롬 8 처럼 주소를, 믿음 소망 처럼 낱말을</p>}
        </div>
      )}
    </div>
  );
}

/** 한 권에서 처음 보이는 절 수 — 넘으면 「더 보기」 */
const PER_BOOK = 5;
/** 한 화면에 그리는 절 상한 — 넘으면 낱말을 더 넣어 보라고 한다 */
const MAX_SHOWN = 400;

interface BibleSearchResultsProps {
  bible: BibleData | null;
  q: string;
  backLabel: string;
  onBack: () => void;
  onPick: (b: number, c: number, v: number) => void;
}

/** 낱말 찾기 결과 — 본문 자리에 대신 놓인다. 권별로 묶고, 누르면 그 절로 */
export function BibleSearchResults({
  bible,
  q,
  backLabel,
  onBack,
  onPick,
}: BibleSearchResultsProps) {
  const [scope, setScope] = useState<SearchScope>('all');
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const terms = useMemo(() => searchTerms(q), [q]);
  const hits = useMemo(() => (bible ? searchBible(bible, q, scope) : []), [bible, q, scope]);
  const groups = useMemo(() => groupByBook(hits), [hits]);
  const topRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setOpen(new Set());
    topRef.current?.scrollIntoView?.({ block: 'start' });
  }, [q, scope]);

  let shown = 0;
  return (
    <article className="sn-bible-page sn-bsr" ref={topRef} aria-label={`「${q}」 찾기 결과`}>
      <div className="sn-bsr-head">
        <button type="button" className="sn-bsr-back" onClick={onBack}>
          <ChevronLeft className="sn-icon" aria-hidden />
          {backLabel}
        </button>
        <div className="sn-bsr-title">
          <h2>「{q}」</h2>
          {bible && (
            <span className="sn-label" role="status">
              {hits.length.toLocaleString()}절 · {groups.length}권
            </span>
          )}
        </div>
        <div className="sn-bsr-scope" role="group" aria-label="찾을 범위">
          {(
            [
              ['all', '전체'],
              ['ot', '구약'],
              ['nt', '신약'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className="sn-chip"
              aria-pressed={scope === k}
              onClick={() => setScope(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {!bible ? (
        <div className="sn-empty">성경 본문을 불러오는 중이에요.</div>
      ) : !hits.length ? (
        <div className="sn-empty">
          「{q}」가 들어간 절이 없어요. 개역한글 표기로 바꾸거나 낱말을 줄여 보세요.
        </div>
      ) : (
        <div className="sn-bsr-list">
          {groups.map((g) => {
            if (shown >= MAX_SHOWN) return null;
            const all = open.has(g.b);
            const vis = (all ? g.hits : g.hits.slice(0, PER_BOOK)).slice(0, MAX_SHOWN - shown);
            shown += vis.length;
            return (
              <section key={g.b} className="sn-bsr-group" aria-label={BOOKS[g.b][0]}>
                <div className="sn-bsr-gh">
                  <span>{BOOKS[g.b][0]}</span>
                  <span>{g.hits.length}절</span>
                </div>
                {vis.map((h) => (
                  <button
                    key={`${h.c}:${h.v}`}
                    type="button"
                    className="sn-bsr-hit"
                    onClick={() => onPick(h.b, h.c, h.v)}
                  >
                    <span className="sn-bsr-ref">
                      {refShort({ b: h.b, c: h.c, v1: h.v, v2: h.v, whole: false })}
                    </span>
                    <span className="sn-bsr-t">
                      {splitTerms(bible[h.b][h.c - 1][h.v - 1], terms).map((p, i) =>
                        p.hit ? <mark key={i}>{p.t}</mark> : <span key={i}>{p.t}</span>,
                      )}
                    </span>
                  </button>
                ))}
                {!all && g.hits.length > vis.length && shown < MAX_SHOWN && (
                  <button
                    type="button"
                    className="sn-bsr-more"
                    onClick={() => setOpen((s) => new Set(s).add(g.b))}
                  >
                    {BOOKS[g.b][0]} {g.hits.length - vis.length}절 더 보기
                  </button>
                )}
              </section>
            );
          })}
          {shown >= MAX_SHOWN && hits.length > shown && (
            <p className="sn-bsr-cap">
              결과가 많아 앞의 {shown}절만 보여요. 낱말을 더 넣어 좁혀 보세요.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
