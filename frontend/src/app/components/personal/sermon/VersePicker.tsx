import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import {
  BOOKS,
  OT_COUNT,
  PSALMS,
  chCount,
  encRef,
  refLong,
  refShort,
  suggest,
  vCount,
  type Ref,
  type Suggestion,
} from './bibleRefs';
import { verseHTML } from './editorCore';
import { useBible } from './useBible';
import { SnOverlay } from './SnOverlay';

/**
 * 구절 찾기 창 — 기획서 §5.
 * 탭: 빠른 입력 / 책 · 장 선택 / 최근 구절. 오른쪽 미리보기와 넣는 방식.
 * 키보드: Enter 넣기 · ↑↓ 고르기 · Tab 넣는 방식 바꾸기 · Esc 닫기.
 */
export type InsertForm = 'block' | 'chip' | 'thought' | 'meta';
export type PickerTarget = 'editor' | 'meta';

interface VersePickerProps {
  open: boolean;
  target: PickerTarget;
  recent: Ref[];
  onClose: () => void;
  onInsert: (ref: Ref, form: InsertForm) => void;
}

type Tab = 'quick' | 'book' | 'recent';
const FORMS: Array<[Exclude<InsertForm, 'meta'>, string]> = [
  ['block', '본문 블록'],
  ['chip', '문장 속 칩'],
  ['thought', '생각 패널에'],
];

export function VersePicker({ open, target, recent, onClose, onInsert }: VersePickerProps) {
  const { bible } = useBible();
  const [tab, setTab] = useState<Tab>('quick');
  const [q, setQ] = useState('');
  const [list, setList] = useState<Suggestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState<Ref | null>(null);
  const [form, setForm] = useState<Exclude<InsertForm, 'meta'>>('block');
  const [bookB, setBookB] = useState<number | null>(null);
  const [bookC, setBookC] = useState<number | null>(null);
  const [v1, setV1] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 열 때마다 초기화
  useEffect(() => {
    if (!open) return;
    setTab('quick');
    setQ('');
    setList([]);
    setIdx(0);
    setSel(null);
    setForm('block');
    setBookB(null);
    setBookC(null);
    setV1(null);
  }, [open]);

  useEffect(() => {
    if (open && tab === 'quick') window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, tab]);

  const onQuery = useCallback((value: string) => {
    setQ(value);
    const l = suggest(value);
    setList(l);
    setIdx(0);
    setSel(l[0]?.ref ?? null);
  }, []);

  const pickSuggestion = useCallback(
    (i: number) => {
      const s = list[i];
      if (!s) return;
      if (s.book != null) {
        onQuery(`${BOOKS[s.book][1]} `);
        inputRef.current?.focus();
      } else {
        setIdx(i);
        setSel(s.ref ?? null);
      }
    },
    [list, onQuery],
  );

  const doInsert = useCallback(() => {
    if (!sel) return;
    onInsert(sel, target === 'meta' ? 'meta' : form);
  }, [sel, form, target, onInsert]);

  const onKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const n = Math.min(list.length - 1, idx + 1);
      setIdx(n);
      setSel(list[n]?.ref ?? null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const n = Math.max(0, idx - 1);
      setIdx(n);
      setSel(list[n]?.ref ?? null);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = list[idx];
      if (s && s.book != null) onQuery(`${BOOKS[s.book][1]} `);
      else doInsert();
    } else if (e.key === 'Tab' && target !== 'meta') {
      e.preventDefault();
      const order = FORMS.map((f) => f[0]);
      setForm(order[(order.indexOf(form) + 1) % order.length]);
    }
  };

  // ── 미리보기 ──
  const preview = useMemo(() => {
    if (!sel) return null;
    const long = sel.v2 - sel.v1 > 9;
    const shown = long ? { ...sel, v2: sel.v1 + 9 } : sel;
    return { html: verseHTML(shown, false), rest: long ? sel.v2 - sel.v1 - 9 : 0 };
    // bible 이 로드되면 다시 계산
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, bible]);

  // ── 책 · 장 선택 ──
  const bookTab = (
    <>
      <div className="sn-crumb">
        <button
          type="button"
          onClick={() => {
            setBookB(null);
            setBookC(null);
            setV1(null);
          }}
        >
          성경
        </button>
        {bookB != null && (
          <>
            <span>›</span>
            <button
              type="button"
              onClick={() => {
                setBookC(null);
                setV1(null);
              }}
            >
              {BOOKS[bookB][0]}
            </button>
          </>
        )}
        {bookB != null && bookC != null && (
          <>
            <span>›</span>
            <span>
              {bookC}
              {bookB === PSALMS ? '편' : '장'}
            </span>
          </>
        )}
      </div>
      {bookB == null ? (
        <>
          <div className="sn-label">구약</div>
          <div className="sn-book-grid">
            {BOOKS.slice(0, OT_COUNT).map((b, i) => (
              <button
                key={b[0]}
                type="button"
                title={b[0]}
                onClick={() => {
                  setBookB(i);
                  if (chCount(i) === 1) setBookC(1);
                }}
              >
                {b[1]}
              </button>
            ))}
          </div>
          <div className="sn-label">신약</div>
          <div className="sn-book-grid">
            {BOOKS.slice(OT_COUNT).map((b, i) => (
              <button
                key={b[0]}
                type="button"
                title={b[0]}
                onClick={() => {
                  setBookB(i + OT_COUNT);
                  if (chCount(i + OT_COUNT) === 1) setBookC(1);
                }}
              >
                {b[1]}
              </button>
            ))}
          </div>
        </>
      ) : bookC == null ? (
        <div className="sn-book-grid">
          {Array.from({ length: chCount(bookB) }, (_, i) => i + 1).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setBookC(c);
                setV1(null);
                setSel({ b: bookB, c, v1: 1, v2: vCount(bookB, c), whole: true });
              }}
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="sn-label">시작 절을 누르고, 범위면 끝 절을 한 번 더 누르세요</div>
          <div>
            <button
              type="button"
              className="sn-chip"
              aria-pressed={!!sel && sel.whole && sel.b === bookB && sel.c === bookC}
              onClick={() => {
                setV1(null);
                setSel({ b: bookB, c: bookC, v1: 1, v2: vCount(bookB, bookC), whole: true });
              }}
            >
              장 전체
            </button>
          </div>
          <div className="sn-book-grid">
            {Array.from({ length: vCount(bookB, bookC) }, (_, i) => i + 1).map((v) => {
              const s = sel && sel.b === bookB && sel.c === bookC && !sel.whole ? sel : null;
              const on = !!s && (v === s.v1 || v === s.v2);
              const inr = !!s && v > s.v1 && v < s.v2;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  className={inr ? 'sn-inr' : undefined}
                  onClick={() => {
                    if (v1 == null || v < v1) {
                      setV1(v);
                      setSel({ b: bookB, c: bookC, v1: v, v2: v, whole: false });
                    } else {
                      setSel({ b: bookB, c: bookC, v1, v2: v, whole: false });
                      setV1(null);
                    }
                  }}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );

  const recentShort = recent.slice(0, 4);

  return (
    <SnOverlay
      open={open}
      onClose={onClose}
      className="sn-picker"
      aria-label="성경구절 찾기"
      initialFocus="#sn-pq"
    >
      <div className="sn-ptabs" role="tablist">
        {(
          [
            ['quick', '빠른 입력'],
            ['book', '책 · 장 선택'],
            ['recent', '최근 구절'],
          ] as Array<[Tab, string]>
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
        <span className="sn-sp" />
        <span className="sn-tag">개역한글</span>
      </div>
      <div className="sn-pbody">
        <div className="sn-pleft">
          {tab === 'quick' && (
            <>
              <label className="sn-label" htmlFor="sn-pq">
                약어, 띄어쓰기, 범위 모두 돼요 · 롬8:28 / 로마서 8장 28절 / 롬 8:28-30 / 시23편
              </label>
              <div className="sn-pin">
                <Search className="sn-icon" style={{ color: 'var(--sn-muted)' }} aria-hidden />
                <input
                  id="sn-pq"
                  ref={inputRef}
                  autoComplete="off"
                  placeholder="구절 입력"
                  value={q}
                  onChange={(e) => onQuery(e.target.value)}
                  onKeyDown={onKeys}
                />
              </div>
              {!q.trim() ? (
                recentShort.length > 0 && (
                  <div className="sn-sugs">
                    <div className="sn-label" style={{ padding: '10px 14px 4px' }}>
                      최근
                    </div>
                    {recentShort.map((r) => (
                      <button
                        key={encRef(r)}
                        type="button"
                        className="sn-sug"
                        onClick={() => {
                          onQuery(refShort(r));
                          setSel(r);
                        }}
                      >
                        <b>{refLong(r)}</b>
                      </button>
                    ))}
                  </div>
                )
              ) : list.length === 0 ? (
                <div className="sn-th-empty" style={{ padding: '12px 14px' }}>
                  ‘{q.trim()}’을(를) 구절로 읽지 못했어요. 책 이름과 장:절을 확인해 주세요.
                </div>
              ) : (
                <div className="sn-sugs">
                  {list.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className="sn-sug"
                      aria-selected={i === idx}
                      onClick={() => pickSuggestion(i)}
                    >
                      <b>{s.ref ? refLong(s.ref) : BOOKS[s.book as number][0]}</b>
                      <span className="sn-sub">{s.sub}</span>
                      <span className="sn-sp" />
                      <span className="sn-k">{i === idx ? 'Enter' : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === 'book' && bookTab}
          {tab === 'recent' &&
            (recent.length ? (
              <div className="sn-sugs">
                {recent.map((r) => (
                  <button
                    key={encRef(r)}
                    type="button"
                    className="sn-sug"
                    aria-selected={!!sel && encRef(sel) === encRef(r)}
                    onClick={() => setSel(r)}
                  >
                    <b>{refLong(r)}</b>
                    <span className="sn-sp" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="sn-th-empty">넣었던 구절이 여기 모여요.</div>
            ))}
        </div>
        <div className="sn-pright">
          <div className="sn-label">미리보기</div>
          {sel && preview ? (
            <>
              <div className="sn-prev-ref">{refLong(sel)}</div>
              <div className="sn-prev-txt">
                <span dangerouslySetInnerHTML={{ __html: preview.html }} />
                {preview.rest > 0 && <div className="sn-label">… 외 {preview.rest}절</div>}
              </div>
            </>
          ) : (
            <div className="sn-th-empty" style={{ padding: 0 }}>
              구절을 고르면 본문이 여기 보여요.
            </div>
          )}
          {target === 'meta' ? (
            <div className="sn-label">이 구절을 오늘 설교 본문으로 등록해요</div>
          ) : (
            <>
              <div className="sn-label">넣는 방식</div>
              <div className="sn-forms">
                {FORMS.map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={form === k}
                    onClick={() => setForm(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="sn-pfoot">
        <span className="sn-keys">Enter 넣기 · ↑↓ 고르기 · Esc 닫기</span>
        <button type="button" className="sn-btn" onClick={onClose}>
          취소
        </button>
        <button type="button" className="sn-btn sn-primary" disabled={!sel} onClick={doInsert}>
          넣기
        </button>
      </div>
    </SnOverlay>
  );
}
