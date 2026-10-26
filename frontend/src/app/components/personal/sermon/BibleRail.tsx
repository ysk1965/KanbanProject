import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BOOKS, chCount, PSALMS } from './bibleRefs';
import { marksOn, type ReadMark } from './bibleMarks';
import { rangeText, spanOn, type Highlight } from './bibleHighlights';
import { UNTITLED } from './sermonTypes';
import './bibleRail.css';

/**
 * 성경 읽기 — 오른쪽 길잡이 레일 (넓은 화면 전용, CSS 가 좁은 화면에서 숨긴다).
 * 본문을 따라 내려오며 「지금 몇 절쯤」 + 이 장의 갈피(설교 구절·형광펜)로 바로 가기 + 장 넘기기.
 * 본문 카드 밖에 둔다 — 카드 안 오른쪽 여백은 손글씨 자리.
 */

interface Step {
  b: number;
  c: number;
}

interface BibleRailProps {
  b: number;
  c: number;
  /** 장의 본문 (절 수·형광펜 글귀) */
  text: string[];
  /** 이 장의 설교 자국 (손글씨가 꺼져 있으면 빈 배열) */
  list: ReadMark[];
  /** 이 장의 형광펜 (형광펜이 꺼져 있으면 빈 배열) */
  hls: Highlight[];
  /** 지금 화면에 보이는 절 [처음, 끝] */
  seen: [number, number] | null;
  prev: Step | null;
  next: Step | null;
  stepLabel: (r: Step) => string;
  onGo: (b: number, c: number) => void;
  onJump: (v: number) => void;
}

/** 절이 이만큼 넘으면 칸 대신 얇은 막대 (시편 119편 = 176절) */
const DENSE = 60;
const TEXT_MAX = 40;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const span = (v1: number, v2: number) => (v1 === v2 ? `${v1}절` : `${v1}–${v2}절`);
/** '2026-10-25' → '10.25' */
const md = (ds: string | null | undefined) => {
  const [, m, d] = (ds || '').split('-').map(Number);
  return m && d ? `${m}.${d}` : '';
};

interface Item {
  key: string;
  v1: number;
  v2: number;
  label: string;
  kind: 'main' | 'quote' | 'hl';
  text: string;
  /** 손글씨(생각·메모)라 손글씨 글꼴로 */
  hand: boolean;
}

export function BibleRail({
  b,
  c,
  text,
  list,
  hls,
  seen,
  prev,
  next,
  stepLabel,
  onGo,
  onJump,
}: BibleRailProps) {
  const count = text.length;
  const unit = b === PSALMS ? '편' : '장';
  const dense = count > DENSE;
  const verseText = (v: number) => text[v - 1] || '';

  const items: Item[] = [
    ...list.map((m) => {
      const t = m.thoughts[0]?.text.replace(/\s+/g, ' ');
      const title = m.note.title || UNTITLED;
      return {
        key: `${m.note.id}|${m.ref.v1}-${m.ref.v2}|${m.ref.whole ? 'w' : ''}`,
        v1: m.ref.whole ? 1 : m.ref.v1,
        v2: m.ref.whole ? 1 : m.ref.v2,
        label: m.ref.whole ? '장 전체' : span(m.ref.v1, m.ref.v2),
        kind: m.kind,
        text: t ? clip(t, TEXT_MAX) : `「${clip(title, 18)}」 ${md(m.note.date)}`.trim(),
        hand: !!t,
      };
    }),
    ...hls.map((h) => ({
      key: h.id,
      v1: h.v1,
      v2: h.v2,
      label: span(h.v1, h.v2),
      kind: 'hl' as const,
      text: clip(h.memo.trim() || rangeText(h, verseText), TEXT_MAX),
      hand: !!h.memo.trim(),
    })),
  ].sort((x, y) => x.v1 - y.v1 || x.v2 - y.v2);

  const isHere = (v1: number, v2: number) => !!seen && v1 <= seen[1] && v2 >= seen[0];

  return (
    <aside className="sn-brail" aria-label="이 장 길잡이">
      <div className="sn-brail-in">
        <section className="sn-brail-card">
          <div className="sn-brail-top">
            <button
              type="button"
              className="sn-brail-step"
              aria-label={prev ? `${stepLabel(prev)}으로` : '이전 장 없음'}
              disabled={!prev}
              onClick={() => prev && onGo(prev.b, prev.c)}
            >
              <ChevronLeft className="sn-icon" aria-hidden />
            </button>
            <strong>
              {BOOKS[b][0]} <em>{c}</em>
            </strong>
            <button
              type="button"
              className="sn-brail-step"
              aria-label={next ? `${stepLabel(next)}으로` : '다음 장 없음'}
              disabled={!next}
              onClick={() => next && onGo(next.b, next.c)}
            >
              <ChevronRight className="sn-icon" aria-hidden />
            </button>
          </div>
          {count > 0 && (
            <>
              <div className="sn-brail-where" aria-live="polite">
                {seen ? (
                  <>
                    지금 <b>{span(seen[0], seen[1])}</b> · {count}절 중
                  </>
                ) : (
                  `${count}절`
                )}
              </div>
              <div
                className="sn-brail-map"
                data-dense={dense || undefined}
                role="list"
                aria-label="절 바로 가기"
              >
                {text.map((t, i) => {
                  const v = i + 1;
                  const on = marksOn(list, v);
                  const sermon = on.some((m) => m.kind === 'main')
                    ? 'main'
                    : on.length
                      ? 'quote'
                      : undefined;
                  const hl = hls.some((h) => spanOn(h, v, t.length));
                  const note =
                    on.some((m) => m.ref.v1 === v && m.thoughts.length > 0) ||
                    hls.some((h) => h.v2 === v && h.memo.trim());
                  return (
                    <button
                      key={v}
                      type="button"
                      role="listitem"
                      className="sn-brail-tick"
                      data-here={(!!seen && v >= seen[0] && v <= seen[1]) || undefined}
                      data-mark={sermon || (hl ? 'hl' : undefined)}
                      data-note={note || undefined}
                      aria-label={`${v}절${sermon ? ', 설교 구절' : ''}${hl ? ', 형광펜' : ''}`}
                      onClick={() => onJump(v)}
                    >
                      {dense ? null : v}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {items.length > 0 && (
            <div className="sn-brail-marks">
              <div className="sn-label">이 장의 갈피 {items.length}</div>
              <ul>
                {items.map((it) => (
                  <li key={it.key}>
                    <button
                      type="button"
                      data-here={isHere(it.v1, it.v2) || undefined}
                      onClick={() => onJump(it.v1)}
                    >
                      <span className="sn-brail-ref" data-k={it.kind}>
                        {it.label}
                      </span>
                      <span className="sn-brail-txt" data-hand={it.hand || undefined}>
                        {it.kind === 'hl' && !it.hand ? '형광펜 · ' : ''}
                        {it.text}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="sn-brail-card sn-brail-book">
          <div className="sn-brail-where">
            {BOOKS[b][0]} <b>{c}</b> / {chCount(b)}
            {unit}
          </div>
          <div className="sn-brail-prog" aria-hidden>
            <i style={{ width: `${(c / chCount(b)) * 100}%` }} />
          </div>
          {next && (
            <button type="button" className="sn-brail-next" onClick={() => onGo(next.b, next.c)}>
              {stepLabel(next)} 읽기
              <ChevronRight className="sn-icon" aria-hidden />
            </button>
          )}
        </section>
      </div>
    </aside>
  );
}
